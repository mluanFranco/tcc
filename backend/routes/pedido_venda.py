from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoVenda, ItemPedidoVenda, Usuario, TituloFinanceiro
from schemas.pedido_venda import PedidoVendaCreate, PedidoVendaStatusUpdate, PedidoVendaResponse
from core.security import get_current_user
from core.estoque import travar_produtos
from core.pedidos import registrar_pedido_venda
from core.financeiro import gerar_titulos, cancelar_titulos_do_pedido
from schemas.financeiro import TituloResponse
from typing import List
from collections import defaultdict
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/pedidos-venda", tags=["Pedidos de Venda"])


@router.post("/", response_model=PedidoVendaResponse)
def criar_pedido_venda(
    dados: PedidoVendaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    # As regras de criação (validações, travamento e reserva de estoque) ficam em core/pedidos.py,
    # compartilhadas com a aprovação de cotação.
    pedido = registrar_pedido_venda(db, usuario.id, dados)
    db.commit()
    db.refresh(pedido)
    return pedido


@router.get("/", response_model=List[PedidoVendaResponse])
def listar_pedidos_venda(
    status: str = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(PedidoVenda)
    if status:
        query = query.filter(PedidoVenda.status == status)
    return query.all()


@router.get("/{pedido_id}", response_model=PedidoVendaResponse)
def buscar_pedido_venda(pedido_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    pedido = db.query(PedidoVenda).filter(PedidoVenda.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de venda não encontrado")
    return pedido


@router.get("/{pedido_id}/titulos", response_model=List[TituloResponse])
def titulos_do_pedido_venda(pedido_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Contas a receber geradas por este pedido (existem a partir da confirmação)."""
    if not db.query(PedidoVenda.id).filter(PedidoVenda.id == pedido_id).first():
        raise HTTPException(status_code=404, detail="Pedido de venda não encontrado")
    return (
        db.query(TituloFinanceiro)
        .options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor))
        .filter(TituloFinanceiro.pedido_venda_id == pedido_id)
        .order_by(TituloFinanceiro.numero_parcela)
        .all()
    )


@router.patch("/{pedido_id}/status", response_model=PedidoVendaResponse)
def atualizar_status_pedido_venda(
    pedido_id: int,
    dados: PedidoVendaStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    # Trava o pedido: duas requisições mudando o status do mesmo pedido ao mesmo tempo
    # passam uma de cada vez, e a segunda já enxerga o status novo.
    pedido = (
        db.query(PedidoVenda)
        .filter(PedidoVenda.id == pedido_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de venda não encontrado")

    novo_status = dados.status
    if novo_status not in ("aberto", "confirmado", "cancelado"):
        raise HTTPException(status_code=400, detail="Status inválido")

    status_atual = pedido.status

    if status_atual == novo_status:
        raise HTTPException(status_code=400, detail=f"Pedido já está com status '{novo_status}'")

    transicoes_validas = {
        ("aberto", "confirmado"),
        ("aberto", "cancelado"),
        ("confirmado", "cancelado"),
    }
    if (status_atual, novo_status) not in transicoes_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Transição de status inválida: '{status_atual}' → '{novo_status}'"
        )

    # CONFIRMADO -> CANCELADO: antes de mexer em estoque, cancela as contas a receber
    # (barra o cancelamento se algum título já tiver recebimento lançado)
    if status_atual == "confirmado" and novo_status == "cancelado":
        cancelar_titulos_do_pedido(db, tipo="receber", pedido_id=pedido.id)

    itens = db.query(ItemPedidoVenda).filter(ItemPedidoVenda.pedido_venda_id == pedido.id).all()

    quantidade_por_produto = defaultdict(Decimal)
    for item in itens:
        quantidade_por_produto[item.produto_id] += item.quantidade

    produtos = travar_produtos(db, quantidade_por_produto.keys())

    # ABERTO -> CONFIRMADO: libera a reserva e debita o estoque físico
    if status_atual == "aberto" and novo_status == "confirmado":
        for produto_id, quantidade in quantidade_por_produto.items():
            produto = produtos[produto_id]
            if produto.estoque_atual < quantidade:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estoque físico insuficiente para confirmar: '{produto.nome}' tem "
                           f"{produto.estoque_atual:.3f} e o pedido precisa de {quantidade:.3f}"
                )
        for produto_id, quantidade in quantidade_por_produto.items():
            produto = produtos[produto_id]
            produto.estoque_reservado -= quantidade
            produto.estoque_atual -= quantidade
        # Contas a receber: nascem na confirmação (a venda se concretiza aqui), vencendo a partir de hoje
        gerar_titulos(db, tipo="receber", pedido=pedido, forma=pedido.forma_pagamento, data_base=date.today())

    # ABERTO -> CANCELADO: apenas libera a reserva, nada saiu do físico
    elif status_atual == "aberto" and novo_status == "cancelado":
        for produto_id, quantidade in quantidade_por_produto.items():
            produtos[produto_id].estoque_reservado -= quantidade

    # CONFIRMADO -> CANCELADO: devolve o estoque físico (já não está mais reservado)
    else:
        for produto_id, quantidade in quantidade_por_produto.items():
            produtos[produto_id].estoque_atual += quantidade

    pedido.status = novo_status

    db.commit()
    db.refresh(pedido)
    return pedido
