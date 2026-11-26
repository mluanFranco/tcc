from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import OrdemProducao, OrdemProducaoItem, Receita, Produto, Usuario
from schemas.ordem_producao import (
    OrdemProducaoCreate, OrdemProducaoStatusUpdate,
    OrdemProducaoResponse, OrdemProducaoItemResponse,
)
from core.security import get_current_user
from core.estoque import travar_produtos
from core.receita import calcular_consumo
from core.quantidades import exigir_inteiro
from typing import List, Optional
from decimal import Decimal
from datetime import datetime, date, time, timedelta

router = APIRouter(prefix="/ordens-producao", tags=["Ordens de Produção"])

ZERO = Decimal("0")


# ---------- auxiliares ----------

def _sigla(produto: Produto) -> Optional[str]:
    return produto.unidade_medida.sigla if produto.unidade_medida else None


def _item_resposta(insumo: Produto, quantidade: Decimal, custo_unitario: float, subtotal: float) -> OrdemProducaoItemResponse:
    return OrdemProducaoItemResponse(
        produto_id=insumo.id,
        produto_nome=insumo.nome,
        unidade_sigla=_sigla(insumo),
        quantidade=quantidade,
        custo_unitario=custo_unitario,
        subtotal=subtotal,
    )


def _montar_resposta(ordem: OrdemProducao) -> OrdemProducaoResponse:
    if ordem.status == "aberta":
        # Quantidades = o que foi RESERVADO na criação (congelado). O custo ainda é prévia (custo atual do insumo):
        # só é congelado na confirmação.
        itens = []
        for i in ordem.itens:
            custo = i.produto.custo_unidade_base   # custo de 1 unidade base (embalagem ÷ fator)
            itens.append(_item_resposta(i.produto, i.quantidade, custo, round(float(i.quantidade) * custo, 2)))
        previa = True
    else:
        itens = [_item_resposta(i.produto, i.quantidade, i.custo_unitario, i.subtotal) for i in ordem.itens]
        previa = False

    return OrdemProducaoResponse(
        id=ordem.id,
        receita_id=ordem.receita_id,
        produto_id=ordem.produto_id,
        produto_nome=ordem.produto.nome,
        unidade_sigla=_sigla(ordem.produto),
        quantidade=ordem.quantidade,
        status=ordem.status,
        usuario_id=ordem.usuario_id,
        usuario_nome=ordem.usuario.nome if ordem.usuario else None,
        observacao=ordem.observacao,
        itens_previa=previa,
        itens=itens,
        custo_total=ordem.custo_total,
        custo_unitario=ordem.custo_unitario,
        confirmada_em=ordem.confirmada_em,
        cancelada_em=ordem.cancelada_em,
        created_at=ordem.created_at,
        updated_at=ordem.updated_at,
    )


# ---------- rotas ----------

@router.post("/", response_model=OrdemProducaoResponse)
def criar_ordem_producao(
    dados: OrdemProducaoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    receita = db.query(Receita).filter(Receita.id == dados.receita_id).first()
    if not receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    if not receita.ativo:
        raise HTTPException(status_code=400, detail="A receita selecionada está inativa")
    if not receita.produto.ativo:
        raise HTTPException(status_code=400, detail=f"O produto '{receita.produto.nome}' está inativo")

    # Ordem aberta RESERVA os insumos (como o pedido de venda aberto): o consumo é calculado agora, pela receita,
    # e fica congelado nos itens da ordem. A confirmação consome exatamente o que foi reservado.
    exigir_inteiro(dados.quantidade, receita.produto.unidade_medida, f"Quantidade a produzir de '{receita.produto.nome}'")
    consumos = calcular_consumo(receita, dados.quantidade)
    if not consumos:
        raise HTTPException(status_code=400, detail="A receita não tem insumos")
    ids = [produto_id for produto_id, _ in consumos]
    produtos = travar_produtos(db, ids)
    if any(pid not in produtos for pid in ids):
        raise HTTPException(status_code=400, detail="A receita foi alterada durante a criação. Tente novamente")

    faltas = []
    for produto_id, consumo in consumos:
        insumo = produtos[produto_id]
        if produto_id == receita.produto_id:
            raise HTTPException(status_code=400, detail="O produto não pode ser insumo da própria receita")
        if not insumo.ativo:
            raise HTTPException(status_code=400, detail=f"O insumo '{insumo.nome}' está inativo")
        if not insumo.e_insumo:
            raise HTTPException(status_code=400, detail=f"O produto '{insumo.nome}' não está mais marcado como insumo")
        disponivel = (insumo.estoque_atual or ZERO) - (insumo.estoque_reservado or ZERO)
        if disponivel < consumo:
            faltas.append(f"'{insumo.nome}' (disponível {disponivel:.3f}, necessário {consumo:.3f})")
    if faltas:
        raise HTTPException(status_code=400, detail="Insumos insuficientes para reservar: " + "; ".join(faltas))

    ordem = OrdemProducao(
        receita_id=receita.id,
        produto_id=receita.produto_id,
        quantidade=dados.quantidade,
        status="aberta",
        usuario_id=usuario.id,
        observacao=dados.observacao,
    )
    for produto_id, consumo in consumos:
        insumo = produtos[produto_id]
        insumo.estoque_reservado = (insumo.estoque_reservado or ZERO) + consumo   # reserva, não debita ainda
        custo = insumo.custo_unidade_base   # prévia; recalculado na confirmação
        ordem.itens.append(OrdemProducaoItem(
            produto_id=produto_id, quantidade=consumo, custo_unitario=custo, subtotal=round(float(consumo) * custo, 2),
        ))
    db.add(ordem)
    db.commit()
    db.refresh(ordem)
    return _montar_resposta(ordem)


@router.get("/", response_model=List[OrdemProducaoResponse])
def listar_ordens_producao(
    status: Optional[str] = None,
    produto_id: Optional[int] = None,
    busca: Optional[str] = Query(default=None, max_length=100),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if status and status not in ("aberta", "confirmada", "cancelada"):
        raise HTTPException(status_code=400, detail="Status inválido")
    if data_inicio and data_fim and data_inicio > data_fim:
        raise HTTPException(status_code=400, detail="A data inicial não pode ser posterior à data final")

    query = db.query(OrdemProducao)
    if status:
        query = query.filter(OrdemProducao.status == status)
    if produto_id:
        query = query.filter(OrdemProducao.produto_id == produto_id)
    if busca:
        query = query.join(Produto, Produto.id == OrdemProducao.produto_id).filter(Produto.nome.ilike(f"%{busca}%"))
    # Período pela data de criação da ordem (o dia final entra por inteiro)
    if data_inicio:
        query = query.filter(OrdemProducao.created_at >= datetime.combine(data_inicio, time.min))
    if data_fim:
        query = query.filter(OrdemProducao.created_at < datetime.combine(data_fim + timedelta(days=1), time.min))
    return [_montar_resposta(o) for o in query.order_by(OrdemProducao.id.desc()).all()]


@router.get("/{ordem_id}", response_model=OrdemProducaoResponse)
def buscar_ordem_producao(ordem_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    ordem = db.query(OrdemProducao).filter(OrdemProducao.id == ordem_id).first()
    if not ordem:
        raise HTTPException(status_code=404, detail="Ordem de produção não encontrada")
    return _montar_resposta(ordem)


@router.patch("/{ordem_id}/status", response_model=OrdemProducaoResponse)
def atualizar_status_ordem_producao(
    ordem_id: int,
    dados: OrdemProducaoStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    # Trava a ordem: duas requisições mudando o status da mesma ordem passam uma de cada vez,
    # e a segunda já enxerga o status novo (a produção nunca é aplicada duas vezes).
    ordem = (
        db.query(OrdemProducao)
        .filter(OrdemProducao.id == ordem_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not ordem:
        raise HTTPException(status_code=404, detail="Ordem de produção não encontrada")

    novo_status = dados.status
    if novo_status not in ("aberta", "confirmada", "cancelada"):
        raise HTTPException(status_code=400, detail="Status inválido")

    status_atual = ordem.status
    if status_atual == novo_status:
        raise HTTPException(status_code=400, detail=f"Ordem já está com status '{novo_status}'")

    transicoes_validas = {
        ("aberta", "confirmada"),
        ("aberta", "cancelada"),
        ("confirmada", "cancelada"),
    }
    if (status_atual, novo_status) not in transicoes_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Transição de status inválida: '{status_atual}' → '{novo_status}'",
        )

    # ABERTA -> CANCELADA: libera a reserva dos insumos (nada foi consumido; os itens reservados são descartados)
    if status_atual == "aberta" and novo_status == "cancelada":
        reservas = {i.produto_id: i.quantidade for i in ordem.itens}
        produtos = travar_produtos(db, reservas.keys())
        for produto_id, quantidade in reservas.items():
            p = produtos[produto_id]
            p.estoque_reservado = max(ZERO, (p.estoque_reservado or ZERO) - quantidade)
        ordem.itens.clear()
        ordem.status = "cancelada"
        ordem.cancelada_em = datetime.now()

    # ABERTA -> CONFIRMADA: consome o que foi RESERVADO na criação e dá entrada no produto fabricado
    elif status_atual == "aberta" and novo_status == "confirmada":
        if not ordem.receita.ativo:
            raise HTTPException(status_code=400, detail="A receita desta ordem está inativa")

        reservas = {i.produto_id: i.quantidade for i in ordem.itens}
        produtos = travar_produtos(db, list(reservas.keys()) + [ordem.produto_id])

        fabricado = produtos[ordem.produto_id]
        if not fabricado.ativo:
            raise HTTPException(status_code=400, detail=f"O produto '{fabricado.nome}' está inativo")

        for produto_id, consumo in reservas.items():
            insumo = produtos[produto_id]
            if not insumo.ativo:
                raise HTTPException(status_code=400, detail=f"O insumo '{insumo.nome}' está inativo. Cancele a ordem para liberar a reserva")
            # o reservado já garante o saldo; a conferência é só uma proteção contra dado inconsistente
            if (insumo.estoque_atual or ZERO) < consumo or (insumo.estoque_reservado or ZERO) < consumo:
                raise HTTPException(status_code=400, detail=f"Estoque reservado de '{insumo.nome}' inconsistente. Cancele e crie a ordem novamente")

        custo_total = 0.0
        for item in ordem.itens:
            insumo = produtos[item.produto_id]
            custo = insumo.custo_unidade_base   # custo congelado agora (embalagem ÷ fator)
            item.custo_unitario = custo
            item.subtotal = round(float(item.quantidade) * custo, 2)
            custo_total += item.subtotal
            insumo.estoque_atual -= item.quantidade
            insumo.estoque_reservado -= item.quantidade   # a reserva vira consumo
        fabricado.estoque_atual = (fabricado.estoque_atual or ZERO) + ordem.quantidade

        custo_total = round(custo_total, 2)
        ordem.custo_total = custo_total
        ordem.custo_unitario = round(custo_total / float(ordem.quantidade), 4)
        ordem.status = "confirmada"
        ordem.confirmada_em = datetime.now()

    # CONFIRMADA -> CANCELADA: devolve os insumos (pelas quantidades GRAVADAS) e retira o fabricado
    else:
        a_devolver = {i.produto_id: i.quantidade for i in ordem.itens}
        produtos = travar_produtos(db, list(a_devolver.keys()) + [ordem.produto_id])

        fabricado = produtos[ordem.produto_id]
        disponivel = (fabricado.estoque_atual or ZERO) - (fabricado.estoque_reservado or ZERO)
        if disponivel < ordem.quantidade:
            raise HTTPException(
                status_code=400,
                detail=f"Não é possível cancelar: '{fabricado.nome}' já foi vendido ou reservado. "
                       f"Disponível: {disponivel:.3f}, a devolver: {ordem.quantidade:.3f}",
            )

        fabricado.estoque_atual -= ordem.quantidade
        for produto_id, quantidade in a_devolver.items():
            produtos[produto_id].estoque_atual += quantidade

        ordem.status = "cancelada"
        ordem.cancelada_em = datetime.now()

    db.commit()
    db.refresh(ordem)
    return _montar_resposta(ordem)
