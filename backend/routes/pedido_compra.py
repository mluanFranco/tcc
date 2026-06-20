from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoCompra, ItemPedidoCompra, Produto, Usuario
from schemas.pedido_compra import (
    PedidoCompraCreate, PedidoCompraStatusUpdate,
    PedidoCompraResponse, RegistrarRecebimento
)
from core.security import get_current_user
from typing import List
from datetime import datetime

router = APIRouter(prefix="/pedidos-compra", tags=["Pedidos de Compra"])


@router.post("/", response_model=PedidoCompraResponse)
def criar_pedido_compra(
    dados: PedidoCompraCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    if not dados.itens:
        raise HTTPException(status_code=400, detail="O pedido deve conter ao menos um item")

    valor_total = 0.0
    itens_para_criar = []

    for item in dados.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")

        subtotal = item.preco_unitario * item.quantidade
        valor_total += subtotal
        itens_para_criar.append((item, subtotal))

    pedido = PedidoCompra(
        fornecedor_id=dados.fornecedor_id,
        usuario_id=usuario.id,
        forma_pagamento_id=dados.forma_pagamento_id,
        data_pedido=datetime.now(),
        data_entrega_prevista=dados.data_entrega_prevista,
        valor_total=valor_total,
        status="pendente",
        observacao=dados.observacao
    )
    db.add(pedido)
    db.flush()

    for item, subtotal in itens_para_criar:
        db.add(ItemPedidoCompra(
            pedido_compra_id=pedido.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            quantidade_recebida=0,
            preco_unitario=item.preco_unitario,
            subtotal=subtotal
        ))

    db.commit()
    db.refresh(pedido)
    return pedido


@router.get("/", response_model=List[PedidoCompraResponse])
def listar_pedidos_compra(
    status: str = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(PedidoCompra)
    if status:
        query = query.filter(PedidoCompra.status == status)
    return query.all()


@router.get("/{pedido_id}", response_model=PedidoCompraResponse)
def buscar_pedido_compra(pedido_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    pedido = db.query(PedidoCompra).filter(PedidoCompra.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")
    return pedido


@router.post("/{pedido_id}/receber", response_model=PedidoCompraResponse)
def registrar_recebimento(
    pedido_id: int,
    dados: RegistrarRecebimento,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    """
    Registra uma entrega (parcial ou total) de itens de um pedido de compra.
    Pode ser chamado múltiplas vezes para o mesmo pedido, conforme o fornecedor
    completa o envio. Credita no estoque apenas a quantidade desta entrega específica.
    Quando todos os itens atingem a quantidade pedida, o pedido passa automaticamente
    para 'recebido'.
    """
    pedido = db.query(PedidoCompra).filter(PedidoCompra.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")

    if pedido.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível registrar recebimento em pedidos 'pendente'. Status atual: '{pedido.status}'"
        )

    if not dados.itens:
        raise HTTPException(status_code=400, detail="Informe ao menos um item recebido")

    itens_map = {}
    for entrada in dados.itens:
        item = db.query(ItemPedidoCompra).filter(
            ItemPedidoCompra.id == entrada.item_id,
            ItemPedidoCompra.pedido_compra_id == pedido.id
        ).first()

        if not item:
            raise HTTPException(status_code=404, detail=f"Item {entrada.item_id} não pertence a este pedido")

        if entrada.quantidade_recebida_agora <= 0:
            raise HTTPException(status_code=400, detail="A quantidade recebida deve ser maior que zero")

        restante = item.quantidade - item.quantidade_recebida
        if entrada.quantidade_recebida_agora > restante:
            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            raise HTTPException(
                status_code=400,
                detail=f"Quantidade recebida excede o restante para '{produto.nome}'. "
                       f"Restante a receber: {restante}, informado: {entrada.quantidade_recebida_agora}"
            )

        itens_map[item.id] = (item, entrada.quantidade_recebida_agora)

    for item, qtd_agora in itens_map.values():
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        produto.estoque_atual += qtd_agora
        item.quantidade_recebida += qtd_agora

    todos_itens = db.query(ItemPedidoCompra).filter(ItemPedidoCompra.pedido_compra_id == pedido.id).all()
    if all(i.quantidade_recebida >= i.quantidade for i in todos_itens):
        pedido.status = "recebido"

    db.commit()
    db.refresh(pedido)
    return pedido


@router.patch("/{pedido_id}/status", response_model=PedidoCompraResponse)
def atualizar_status_pedido_compra(
    pedido_id: int,
    dados: PedidoCompraStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    """
    Usado apenas para cancelamento. A transição para 'recebido' é automática
    e ocorre via /receber quando todos os itens são completados.
    """
    pedido = db.query(PedidoCompra).filter(PedidoCompra.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")

    novo_status = dados.status
    if novo_status != "cancelado":
        raise HTTPException(
            status_code=400,
            detail="Use este endpoint apenas para cancelar. O status 'recebido' é definido automaticamente via /receber."
        )

    status_atual = pedido.status
    itens = db.query(ItemPedidoCompra).filter(ItemPedidoCompra.pedido_compra_id == pedido.id).all()

    if status_atual == "cancelado":
        raise HTTPException(status_code=400, detail="Pedido já está cancelado")

    # Estorna qualquer quantidade já recebida (parcial ou total) antes de cancelar
    for item in itens:
        if item.quantidade_recebida > 0:
            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            if produto.estoque_atual < item.quantidade_recebida:
                raise HTTPException(
                    status_code=400,
                    detail=f"Não é possível cancelar: estoque de '{produto.nome}' "
                           f"já foi consumido por vendas posteriores ao recebimento."
                )
            produto.estoque_atual -= item.quantidade_recebida

    pedido.status = "cancelado"

    db.commit()
    db.refresh(pedido)
    return pedido