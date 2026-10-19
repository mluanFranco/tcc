from fastapi import APIRouter, Depends, HTTPException, Query
from decimal import Decimal
from types import SimpleNamespace
from sqlalchemy import and_, case, func, literal, or_
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import TituloFinanceiro, Usuario, Cliente, Fornecedor
from schemas.financeiro import (
    BaixaCreate, GrupoResumo, ResumoTitulosResponse, TituloResponse, TituloDetalheResponse, TituloAvulsoCreate, TituloAvulsoUpdate,
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


def _like(texto: str) -> str:
    """Texto digitado vira padrão LIKE seguro: % e _ digitados valem como letra comum."""
    escapado = texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escapado}%"


def filtros_titulos(
    tipo: Optional[str] = Query(default=None, pattern="^(pagar|receber)$"),
    status: Optional[str] = Query(default=None, pattern="^(aberto|parcial|pendente|pago|cancelado)$", description="pendente = aberto + parcial (o que ainda tem saldo)"),
    vencido: Optional[bool] = Query(default=None, description="true = só vencidos; false = exclui os vencidos"),
    vencimento_de: Optional[date] = None,
    vencimento_ate: Optional[date] = None,
    pedido_venda_id: Optional[int] = Query(default=None, gt=0),
    pedido_compra_id: Optional[int] = Query(default=None, gt=0),
    cliente_id: Optional[int] = Query(default=None, gt=0),
    fornecedor_id: Optional[int] = Query(default=None, gt=0),
    categoria_id: Optional[int] = Query(default=None, gt=0),
    avulso: Optional[bool] = Query(default=None, description="true = só lançamentos avulsos; false = só títulos de pedidos"),
    busca: Optional[str] = Query(default=None, max_length=100, description="Texto na descrição, no nome do cliente/fornecedor ou o número do pedido de origem"),
) -> SimpleNamespace:
    """Filtros comuns da listagem e do resumo (os totais dos cards respeitam exatamente o que a lista mostra)."""
    if vencimento_de and vencimento_ate and vencimento_de > vencimento_ate:
        raise HTTPException(status_code=400, detail="vencimento_de não pode ser maior que vencimento_ate")
    return SimpleNamespace(
        tipo=tipo, status=status, vencido=vencido, vencimento_de=vencimento_de, vencimento_ate=vencimento_ate,
        pedido_venda_id=pedido_venda_id, pedido_compra_id=pedido_compra_id, cliente_id=cliente_id,
        fornecedor_id=fornecedor_id, categoria_id=categoria_id, avulso=avulso,
        busca=(busca or "").strip() or None,
    )


def _aplicar_filtros(db: Session, query, f: SimpleNamespace):
    T = TituloFinanceiro
    if f.tipo:
        query = query.filter(T.tipo == f.tipo)
    if f.status == "pendente":
        query = query.filter(T.status.in_(STATUS_EM_ABERTO))
    elif f.status:
        query = query.filter(T.status == f.status)
    if f.vencimento_de:
        query = query.filter(T.vencimento >= f.vencimento_de)
    if f.vencimento_ate:
        query = query.filter(T.vencimento <= f.vencimento_ate)
    if f.pedido_venda_id:
        query = query.filter(T.pedido_venda_id == f.pedido_venda_id)
    if f.pedido_compra_id:
        query = query.filter(T.pedido_compra_id == f.pedido_compra_id)
    if f.cliente_id:
        query = query.filter(T.cliente_id == f.cliente_id)
    if f.fornecedor_id:
        query = query.filter(T.fornecedor_id == f.fornecedor_id)
    if f.categoria_id:
        query = query.filter(T.categoria_id == f.categoria_id)
    if f.avulso is not None:
        sem_pedido = and_(T.pedido_venda_id.is_(None), T.pedido_compra_id.is_(None))
        query = query.filter(sem_pedido if f.avulso else ~sem_pedido)
    if f.vencido is not None:
        eh_vencido = and_(T.status.in_(STATUS_EM_ABERTO), T.vencimento < date.today())
        query = query.filter(eh_vencido if f.vencido else ~eh_vencido)
    if f.busca:
        padrao = _like(f.busca)
        condicoes = [
            T.descricao.ilike(padrao, escape="\\"),
            T.cliente_id.in_(db.query(Cliente.id).filter(Cliente.nome.ilike(padrao, escape="\\"))),
            T.fornecedor_id.in_(db.query(Fornecedor.id).filter(Fornecedor.nome.ilike(padrao, escape="\\"))),
        ]
        numero = f.busca.lstrip("#")
        if numero.isdigit() and len(numero) <= 9:
            condicoes += [T.pedido_venda_id == int(numero), T.pedido_compra_id == int(numero)]
        query = query.filter(or_(*condicoes))
    return query


@router.get("/titulos", response_model=List[TituloResponse])
def listar_titulos(
    filtros: SimpleNamespace = Depends(filtros_titulos),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(TituloFinanceiro).options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor), joinedload(TituloFinanceiro.categoria))
    query = _aplicar_filtros(db, query, filtros)
    return query.order_by(TituloFinanceiro.vencimento, TituloFinanceiro.id).offset(offset).limit(limit).all()


@router.get("/titulos/resumo", response_model=ResumoTitulosResponse)
def resumo_titulos(
    filtros: SimpleNamespace = Depends(filtros_titulos),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Totais dos títulos que passam nos MESMOS filtros da listagem (sem paginação): quantidade, saldo em aberto,
    quanto desse saldo já venceu e quanto ainda vai vencer, e o total já pago/recebido. Cancelado só conta em `quantidade`.
    """
    T = TituloFinanceiro
    hoje = date.today()
    aberto = T.status.in_(STATUS_EM_ABERTO)
    vencido = and_(aberto, T.vencimento < hoje)
    a_vencer = and_(aberto, T.vencimento >= hoje)
    saldo = T.valor - T.valor_pago
    zero = literal(0)

    consulta = _aplicar_filtros(db, db.query(
        func.count(T.id),
        func.coalesce(func.sum(case((aberto, 1), else_=0)), 0),
        func.coalesce(func.sum(case((aberto, saldo), else_=zero)), 0),
        func.coalesce(func.sum(case((vencido, 1), else_=0)), 0),
        func.coalesce(func.sum(case((vencido, saldo), else_=zero)), 0),
        func.coalesce(func.sum(case((a_vencer, 1), else_=0)), 0),
        func.coalesce(func.sum(case((a_vencer, saldo), else_=zero)), 0),
        func.coalesce(func.sum(case((T.status != "cancelado", T.valor_pago), else_=zero)), 0),
    ), filtros)
    qtd, qtd_aberto, saldo_aberto, qtd_vencido, saldo_vencido, qtd_a_vencer, saldo_a_vencer, pago = consulta.one()
    cent = Decimal("0.01")
    return ResumoTitulosResponse(
        quantidade=int(qtd),
        em_aberto=GrupoResumo(quantidade=int(qtd_aberto), saldo=Decimal(saldo_aberto).quantize(cent)),
        vencido=GrupoResumo(quantidade=int(qtd_vencido), saldo=Decimal(saldo_vencido).quantize(cent)),
        a_vencer=GrupoResumo(quantidade=int(qtd_a_vencer), saldo=Decimal(saldo_a_vencer).quantize(cent)),
        total_pago=Decimal(pago).quantize(cent),
    )


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
