from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoVenda, ItemPedidoVenda, Produto, Usuario
from schemas.pedido_venda import PedidoVendaCreate, PedidoVendaStatusUpdate, PedidoVendaResponse
from core.security import get_current_user
from typing import List
from datetime import datetime

router = APIRouter(prefix="/pedidos-venda", tags=["Pedidos de Venda"])


@router.post("/", response_model=PedidoVendaResponse)
def criar_pedido_venda(
    dados: PedidoVendaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    if not dados.itens:
        raise HTTPException(status_code=400, detail="O pedido deve conter ao menos um item")

    valor_total = 0.0
    itens_para_criar = []

    # 1ª passada: valida disponibilidade de TODOS os itens antes de reservar qualquer um
    for item in dados.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")

        disponivel = produto.estoque_atual - produto.estoque_reservado
        if item.quantidade > disponivel:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque disponível insuficiente para '{produto.nome}'. "
                       f"Disponível: {disponivel}, solicitado: {item.quantidade}"
            )

        subtotal = (item.preco_unitario * item.quantidade) - item.desconto
        valor_total += subtotal
        itens_para_criar.append((produto, item, subtotal))

    # 2ª passada: reserva o estoque e cria o pedido
    pedido = PedidoVenda(
        cliente_id=dados.cliente_id,
        usuario_id=usuario.id,
        data_pedido=datetime.now(),
        valor_total=valor_total,
        status="aberto",
        forma_pagamento=dados.forma_pagamento,
        observacao=dados.observacao
    )
    db.add(pedido)
    db.flush()  # garante pedido.id disponível sem commitar ainda

    for produto, item, subtotal in itens_para_criar:
        db.add(ItemPedidoVenda(
            pedido_venda_id=pedido.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            preco_unitario=item.preco_unitario,
            desconto=item.desconto,
            subtotal=subtotal
        ))
        produto.estoque_reservado += item.quantidade  # reserva, não debita ainda

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


@router.patch("/{pedido_id}/status", response_model=PedidoVendaResponse)
def atualizar_status_pedido_venda(
    pedido_id: int,
    dados: PedidoVendaStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    pedido = db.query(PedidoVenda).filter(PedidoVenda.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de venda não encontrado")

    novo_status = dados.status
    if novo_status not in ("aberto", "confirmado", "cancelado"):
        raise HTTPException(status_code=400, detail="Status inválido")

    status_atual = pedido.status
    itens = db.query(ItemPedidoVenda).filter(ItemPedidoVenda.pedido_venda_id == pedido.id).all()

    # ABERTO -> CONFIRMADO: libera a reserva e debita o estoque físico
    if status_atual == "aberto" and novo_status == "confirmado":
        for item in itens:
            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            produto.estoque_reservado -= item.quantidade
            produto.estoque_atual -= item.quantidade

        pedido.status = "confirmado"

    # ABERTO -> CANCELADO: apenas libera a reserva, nada saiu do físico
    elif status_atual == "aberto" and novo_status == "cancelado":
        for item in itens:
            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            produto.estoque_reservado -= item.quantidade

        pedido.status = "cancelado"

    # CONFIRMADO -> CANCELADO: devolve o estoque físico (já não está mais reservado)
    elif status_atual == "confirmado" and novo_status == "cancelado":
        for item in itens:
            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            produto.estoque_atual += item.quantidade

        pedido.status = "cancelado"

    elif status_atual == novo_status:
        raise HTTPException(status_code=400, detail=f"Pedido já está com status '{novo_status}'")

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Transição de status inválida: '{status_atual}' → '{novo_status}'"
        )

    db.commit()
    db.refresh(pedido)
    return pedido