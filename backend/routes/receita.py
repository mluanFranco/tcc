from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import Receita, ReceitaItem, Produto
from schemas.receita import (
    ReceitaCreate, ReceitaUpdate, ReceitaResponse, ReceitaItemResponse,
    SimulacaoResponse, SimulacaoItem,
)
from core.security import get_current_user
from core.receita import calcular_consumo
from typing import List, Optional
from decimal import Decimal

router = APIRouter(prefix="/receitas", tags=["Receitas"])


# ---------- auxiliares ----------

def _sigla(produto: Produto) -> Optional[str]:
    return produto.unidade_medida.sigla if produto.unidade_medida else None


def _montar_resposta(receita: Receita) -> ReceitaResponse:
    itens = []
    custo_total = 0.0
    for item in receita.itens:
        subtotal = round(float(item.quantidade) * (item.produto.preco_custo or 0.0), 2)
        custo_total += subtotal
        itens.append(ReceitaItemResponse(
            id=item.id,
            produto_id=item.produto_id,
            produto_nome=item.produto.nome,
            unidade_sigla=_sigla(item.produto),
            quantidade=item.quantidade,
            preco_custo=item.produto.preco_custo or 0.0,
            subtotal=subtotal,
            insumo_ativo=bool(item.produto.ativo),
        ))
    custo_total = round(custo_total, 2)
    return ReceitaResponse(
        id=receita.id,
        produto_id=receita.produto_id,
        produto_nome=receita.produto.nome,
        unidade_sigla=_sigla(receita.produto),
        rendimento=receita.rendimento,
        observacao=receita.observacao,
        ativo=bool(receita.ativo),
        itens=itens,
        custo_total_estimado=custo_total,
        custo_unitario_estimado=round(custo_total / float(receita.rendimento), 4),
        created_at=receita.created_at,
        updated_at=receita.updated_at,
    )


def _buscar_ou_404(db: Session, receita_id: int) -> Receita:
    receita = db.query(Receita).filter(Receita.id == receita_id).first()
    if not receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    return receita


def _validar_insumos(db: Session, produto_produzido_id: int, itens) -> None:
    ids = [i.produto_id for i in itens]
    if produto_produzido_id in ids:
        raise HTTPException(status_code=400, detail="O produto não pode ser insumo da própria receita")
    insumos = {p.id: p for p in db.query(Produto).filter(Produto.id.in_(ids)).all()}
    for item in itens:
        insumo = insumos.get(item.produto_id)
        if not insumo:
            raise HTTPException(status_code=404, detail=f"Insumo {item.produto_id} não encontrado")
        if not insumo.ativo:
            raise HTTPException(status_code=400, detail=f"O insumo '{insumo.nome}' está inativo")
        if not insumo.e_insumo:
            raise HTTPException(status_code=400, detail=f"O produto '{insumo.nome}' não está marcado como insumo")


# ---------- rotas ----------

@router.post("/", response_model=ReceitaResponse)
def criar_receita(dados: ReceitaCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == dados.produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if not produto.ativo:
        raise HTTPException(status_code=400, detail=f"O produto '{produto.nome}' está inativo")

    existente = db.query(Receita).filter(Receita.produto_id == dados.produto_id).first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"O produto '{produto.nome}' já possui a receita {existente.id}. Use PUT /receitas/{existente.id} para alterá-la",
        )

    _validar_insumos(db, dados.produto_id, dados.itens)

    receita = Receita(
        produto_id=dados.produto_id,
        rendimento=dados.rendimento,
        observacao=dados.observacao,
        ativo=True,
        itens=[ReceitaItem(produto_id=i.produto_id, quantidade=i.quantidade) for i in dados.itens],
    )
    db.add(receita)
    try:
        db.commit()
    except IntegrityError:
        # duas requisições simultâneas para o mesmo produto: a UNIQUE do banco barra a segunda
        db.rollback()
        raise HTTPException(status_code=400, detail=f"O produto '{produto.nome}' já possui receita")
    db.refresh(receita)
    return _montar_resposta(receita)


@router.get("/", response_model=List[ReceitaResponse])
def listar_receitas(
    incluir_inativos: bool = False,
    produto_id: Optional[int] = Query(default=None, gt=0),
    busca: Optional[str] = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Receita).join(Produto, Produto.id == Receita.produto_id)
    if not incluir_inativos:
        query = query.filter(Receita.ativo == True)
    if produto_id is not None:
        query = query.filter(Receita.produto_id == produto_id)
    if busca:
        query = query.filter(Produto.nome.ilike(f"%{busca}%"))
    return [_montar_resposta(r) for r in query.order_by(Produto.nome).all()]


@router.get("/inativos", response_model=List[ReceitaResponse])
def listar_receitas_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    receitas = db.query(Receita).filter(Receita.ativo == False).order_by(Receita.id).all()
    return [_montar_resposta(r) for r in receitas]


@router.get("/produto/{produto_id}", response_model=ReceitaResponse)
def buscar_receita_do_produto(produto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    receita = db.query(Receita).filter(Receita.produto_id == produto_id).first()
    if not receita:
        raise HTTPException(status_code=404, detail="Este produto não possui receita")
    return _montar_resposta(receita)


@router.get("/{receita_id}", response_model=ReceitaResponse)
def buscar_receita(receita_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _montar_resposta(_buscar_ou_404(db, receita_id))


@router.get("/{receita_id}/simulacao", response_model=SimulacaoResponse)
def simular_producao(
    receita_id: int,
    quantidade: Decimal = Query(gt=0, max_digits=12, decimal_places=3),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Somente leitura: mostra o que seria consumido para produzir `quantidade`. Não reserva nem altera estoque."""
    receita = _buscar_ou_404(db, receita_id)
    consumos = dict(calcular_consumo(receita, quantidade))

    itens = []
    custo = 0.0
    for item in receita.itens:
        insumo = item.produto
        necessario = consumos[item.produto_id]
        disponivel = (insumo.estoque_atual or Decimal("0")) - (insumo.estoque_reservado or Decimal("0"))
        falta = max(Decimal("0"), necessario - disponivel)
        custo += float(necessario) * (insumo.preco_custo or 0.0)
        itens.append(SimulacaoItem(
            produto_id=insumo.id,
            produto_nome=insumo.nome,
            unidade_sigla=_sigla(insumo),
            necessario=necessario,
            disponivel=disponivel,
            falta=falta,
            suficiente=falta == 0,
            insumo_ativo=bool(insumo.ativo),
        ))

    return SimulacaoResponse(
        receita_id=receita.id,
        produto_id=receita.produto_id,
        produto_nome=receita.produto.nome,
        quantidade=quantidade,
        receita_ativa=bool(receita.ativo),
        pode_produzir=bool(receita.ativo) and all(i.suficiente and i.insumo_ativo for i in itens),
        custo_estimado=round(custo, 2),
        itens=itens,
    )


@router.put("/{receita_id}", response_model=ReceitaResponse)
def atualizar_receita(receita_id: int, dados: ReceitaUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    receita = _buscar_ou_404(db, receita_id)
    _validar_insumos(db, receita.produto_id, dados.itens)

    receita.rendimento = dados.rendimento
    receita.observacao = dados.observacao

    # Atualiza a lista de insumos por diferença: mantém os que continuam, remove os que saíram, cria os novos
    atuais = {i.produto_id: i for i in receita.itens}
    novos_ids = {i.produto_id for i in dados.itens}
    for produto_id, item in atuais.items():
        if produto_id not in novos_ids:
            receita.itens.remove(item)          # delete-orphan apaga a linha
    for novo in dados.itens:
        if novo.produto_id in atuais:
            atuais[novo.produto_id].quantidade = novo.quantidade
        else:
            receita.itens.append(ReceitaItem(produto_id=novo.produto_id, quantidade=novo.quantidade))

    db.commit()
    db.refresh(receita)
    return _montar_resposta(receita)


@router.delete("/{receita_id}")
def desativar_receita(receita_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    receita = _buscar_ou_404(db, receita_id)
    receita.ativo = False
    db.commit()
    return {"message": f"Receita do produto {receita.produto.nome} desativada com sucesso"}


@router.patch("/{receita_id}/reativar", response_model=ReceitaResponse)
def reativar_receita(receita_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    receita = _buscar_ou_404(db, receita_id)
    if not receita.produto.ativo:
        raise HTTPException(status_code=400, detail=f"O produto '{receita.produto.nome}' está inativo; reative-o primeiro")
    receita.ativo = True
    db.commit()
    db.refresh(receita)
    return _montar_resposta(receita)
