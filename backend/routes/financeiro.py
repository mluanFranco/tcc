from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import TituloFinanceiro, Usuario
from schemas.financeiro import (
    BaixaCreate, TituloResponse, TituloDetalheResponse, TituloAvulsoCreate, TituloAvulsoUpdate,
)
from core.security import get_current_user
from core.financeiro import (
    registrar_baixa, estornar_baixa, STATUS_EM_ABERTO,
    criar_titulos_avulsos, editar_titulo_avulso, cancelar_titulo_avulso,
)
from typing import List, Optional
from datetime import date

router = APIRouter(prefix="/financeiro", tags=["Financeiro"])


def _titulo_detalhado(db: Session, titulo_id: int) -> TituloFinanceiro:
    titulo = (
        db.query(TituloFinanceiro)
        .options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor), joinedload(TituloFinanceiro.categoria))
        .filter(TituloFinanceiro.id == titulo_id)
        .first()
    )
    if not titulo:
        raise HTTPException(status_code=404, detail="Título não encontrado")
    return titulo


@router.get("/titulos", response_model=List[TituloResponse])
def listar_titulos(
    tipo: Optional[str] = Query(default=None, pattern="^(pagar|receber)$"),
    status: Optional[str] = Query(default=None, pattern="^(aberto|parcial|pago|cancelado)$"),
    vencido: Optional[bool] = Query(default=None, description="true = só vencidos; false = exclui os vencidos"),
    vencimento_de: Optional[date] = None,
    vencimento_ate: Optional[date] = None,
    pedido_venda_id: Optional[int] = Query(default=None, gt=0),
    pedido_compra_id: Optional[int] = Query(default=None, gt=0),
    cliente_id: Optional[int] = Query(default=None, gt=0),
    fornecedor_id: Optional[int] = Query(default=None, gt=0),
    categoria_id: Optional[int] = Query(default=None, gt=0),
    avulso: Optional[bool] = Query(default=None, description="true = só lançamentos avulsos; false = só títulos de pedidos"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if vencimento_de and vencimento_ate and vencimento_de > vencimento_ate:
        raise HTTPException(status_code=400, detail="vencimento_de não pode ser maior que vencimento_ate")

    query = db.query(TituloFinanceiro).options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor), joinedload(TituloFinanceiro.categoria))
    if tipo:
        query = query.filter(TituloFinanceiro.tipo == tipo)
    if status:
        query = query.filter(TituloFinanceiro.status == status)
    if vencimento_de:
        query = query.filter(TituloFinanceiro.vencimento >= vencimento_de)
    if vencimento_ate:
        query = query.filter(TituloFinanceiro.vencimento <= vencimento_ate)
    if pedido_venda_id:
        query = query.filter(TituloFinanceiro.pedido_venda_id == pedido_venda_id)
    if pedido_compra_id:
        query = query.filter(TituloFinanceiro.pedido_compra_id == pedido_compra_id)
    if cliente_id:
        query = query.filter(TituloFinanceiro.cliente_id == cliente_id)
    if fornecedor_id:
        query = query.filter(TituloFinanceiro.fornecedor_id == fornecedor_id)
    if categoria_id:
        query = query.filter(TituloFinanceiro.categoria_id == categoria_id)
    if avulso is not None:
        sem_pedido = and_(TituloFinanceiro.pedido_venda_id.is_(None), TituloFinanceiro.pedido_compra_id.is_(None))
        query = query.filter(sem_pedido if avulso else ~sem_pedido)
    if vencido is not None:
        eh_vencido = and_(TituloFinanceiro.status.in_(STATUS_EM_ABERTO), TituloFinanceiro.vencimento < date.today())
        query = query.filter(eh_vencido if vencido else ~eh_vencido)

    return query.order_by(TituloFinanceiro.vencimento, TituloFinanceiro.id).offset(offset).limit(limit).all()


@router.post("/titulos", response_model=List[TituloResponse])
def lancar_titulo_avulso(dados: TituloAvulsoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """
    Lançamento sem pedido (aluguel, energia, folha, outras receitas...).
    Com `repetir_meses` cria um título por mês, todos no mesmo dia e valor (numerados 1/N, 2/N...).
    """
    criados = criar_titulos_avulsos(
        db, tipo=dados.tipo, descricao=dados.descricao, categoria_id=dados.categoria_id, valor=dados.valor,
        vencimento=dados.vencimento, cliente_id=dados.cliente_id, fornecedor_id=dados.fornecedor_id,
        repetir_meses=dados.repetir_meses,
    )
    ids = [t.id for t in criados]
    db.commit()
    db.expire_all()
    return (
        db.query(TituloFinanceiro)
        .options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor), joinedload(TituloFinanceiro.categoria))
        .filter(TituloFinanceiro.id.in_(ids)).order_by(TituloFinanceiro.numero_parcela).all()
    )


@router.get("/titulos/{titulo_id}", response_model=TituloDetalheResponse)
def buscar_titulo(titulo_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _titulo_detalhado(db, titulo_id)


@router.post("/titulos/{titulo_id}/baixas", response_model=TituloDetalheResponse)
def dar_baixa(
    titulo_id: int,
    dados: BaixaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Registra um pagamento (título a pagar) ou recebimento (título a receber), total ou parcial."""
    registrar_baixa(db, titulo_id, usuario.id, dados.valor, dados.data_pagamento or date.today(), dados.observacao)
    db.commit()
    db.expire_all()
    return _titulo_detalhado(db, titulo_id)


@router.post("/titulos/{titulo_id}/baixas/{baixa_id}/estornar", response_model=TituloDetalheResponse)
def estornar(
    titulo_id: int,
    baixa_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Desfaz uma baixa lançada por engano. A baixa fica registrada como estornada (não é apagada)."""
    estornar_baixa(db, titulo_id, baixa_id, usuario.id)
    db.commit()
    db.expire_all()
    return _titulo_detalhado(db, titulo_id)


@router.put("/titulos/{titulo_id}", response_model=TituloDetalheResponse)
def editar_avulso(titulo_id: int, dados: TituloAvulsoUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """
    Edita um lançamento avulso 'aberto' e sem baixa. Só o que for enviado muda; edita apenas este título
    (numa recorrência, cada mês é editado separadamente). Título de pedido não é editável.
    """
    editar_titulo_avulso(db, titulo_id, {nome: getattr(dados, nome) for nome in dados.model_fields_set})
    db.commit()
    db.expire_all()
    return _titulo_detalhado(db, titulo_id)


@router.patch("/titulos/{titulo_id}/cancelar", response_model=TituloDetalheResponse)
def cancelar_avulso(titulo_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Cancela um lançamento avulso 'aberto' e sem baixa. Título de pedido é cancelado junto com o pedido."""
    cancelar_titulo_avulso(db, titulo_id)
    db.commit()
    db.expire_all()
    return _titulo_detalhado(db, titulo_id)
