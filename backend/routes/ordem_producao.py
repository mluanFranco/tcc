from fastapi import APIRouter, Depends, HTTPException
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
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

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
        # Prévia: consumo e custo pela receita ATUAL. Só é congelado na confirmação.
        itens_receita = {i.produto_id: i for i in ordem.receita.itens}
        itens = []
        for produto_id, consumo in calcular_consumo(ordem.receita, ordem.quantidade):
            insumo = itens_receita[produto_id].produto
            custo = insumo.preco_custo or 0.0
            itens.append(_item_resposta(insumo, consumo, custo, round(float(consumo) * custo, 2)))
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

    # Ordem aberta não reserva nada: o estoque só é verificado e movimentado na confirmação.
    ordem = OrdemProducao(
        receita_id=receita.id,
        produto_id=receita.produto_id,
        quantidade=dados.quantidade,
        status="aberta",
        usuario_id=usuario.id,
        observacao=dados.observacao,
    )
    db.add(ordem)
    db.commit()
    db.refresh(ordem)
    return _montar_resposta(ordem)


@router.get("/", response_model=List[OrdemProducaoResponse])
def listar_ordens_producao(
    status: Optional[str] = None,
    produto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(OrdemProducao)
    if status:
        query = query.filter(OrdemProducao.status == status)
    if produto_id:
        query = query.filter(OrdemProducao.produto_id == produto_id)
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

    # ABERTA -> CANCELADA: nada foi movimentado
    if status_atual == "aberta" and novo_status == "cancelada":
        ordem.status = "cancelada"
        ordem.cancelada_em = datetime.now()

    # ABERTA -> CONFIRMADA: consome os insumos e dá entrada no produto fabricado
    elif status_atual == "aberta" and novo_status == "confirmada":
        receita = ordem.receita
        if not receita.ativo:
            raise HTTPException(status_code=400, detail="A receita desta ordem está inativa")

        consumos = calcular_consumo(receita, ordem.quantidade)

        ids = [produto_id for produto_id, _ in consumos] + [ordem.produto_id]
        produtos = travar_produtos(db, ids)

        # Se a receita ganhou um insumo novo entre a leitura e o travamento, recomeça
        if any(pid not in produtos for pid in ids):
            raise HTTPException(status_code=400, detail="A receita foi alterada durante a confirmação. Tente novamente")

        fabricado = produtos[ordem.produto_id]
        if not fabricado.ativo:
            raise HTTPException(status_code=400, detail=f"O produto '{fabricado.nome}' está inativo")

        faltas = []
        for produto_id, consumo in consumos:
            insumo = produtos[produto_id]
            if produto_id == ordem.produto_id:
                raise HTTPException(status_code=400, detail="O produto não pode ser insumo da própria receita")
            if not insumo.ativo:
                raise HTTPException(status_code=400, detail=f"O insumo '{insumo.nome}' está inativo")
            if not insumo.e_insumo:
                raise HTTPException(status_code=400, detail=f"O produto '{insumo.nome}' não está mais marcado como insumo")
            disponivel = (insumo.estoque_atual or ZERO) - (insumo.estoque_reservado or ZERO)
            if disponivel < consumo:
                faltas.append(f"'{insumo.nome}' (disponível {disponivel:.3f}, necessário {consumo:.3f})")
        if faltas:
            raise HTTPException(status_code=400, detail="Insumos insuficientes: " + "; ".join(faltas))

        custo_total = 0.0
        for produto_id, consumo in consumos:
            insumo = produtos[produto_id]
            custo = insumo.preco_custo or 0.0
            subtotal = round(float(consumo) * custo, 2)
            custo_total += subtotal
            insumo.estoque_atual -= consumo
            ordem.itens.append(OrdemProducaoItem(
                produto_id=produto_id, quantidade=consumo, custo_unitario=custo, subtotal=subtotal,
            ))
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
