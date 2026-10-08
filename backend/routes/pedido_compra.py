from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoCompra, ItemPedidoCompra, Fornecedor, FormaPagamento, Usuario
from schemas.pedido_compra import (
    PedidoCompraCreate, PedidoCompraStatusUpdate,
    PedidoCompraResponse, RegistrarRecebimento
)
from core.security import get_current_user
from core.estoque import travar_produtos
from typing import List
from collections import defaultdict
from decimal import Decimal
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

    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == dados.fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    if not fornecedor.ativo:
        raise HTTPException(status_code=400, detail="O fornecedor selecionado está inativo")

    if dados.forma_pagamento_id is not None:
        forma = db.query(FormaPagamento).filter(FormaPagamento.id == dados.forma_pagamento_id).first()
        if not forma:
            raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
        if not forma.ativo:
            raise HTTPException(status_code=400, detail="A forma de pagamento selecionada está inativa")

    # Mesma ordem de travamento das demais rotas de estoque (ids crescentes), o que evita deadlock
    produtos = travar_produtos(db, [item.produto_id for item in dados.itens])

    valor_total = 0.0
    itens_para_criar = []

    for item in dados.itens:
        produto = produtos.get(item.produto_id)
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")
        if not produto.ativo:
            raise HTTPException(status_code=400, detail=f"O produto '{produto.nome}' está inativo")

        subtotal = round(item.preco_unitario * float(item.quantidade), 2)
        valor_total += subtotal
        itens_para_criar.append((item, subtotal))

    pedido = PedidoCompra(
        fornecedor_id=dados.fornecedor_id,
        usuario_id=usuario.id,
        forma_pagamento_id=dados.forma_pagamento_id,
        data_pedido=datetime.now(),
        data_entrega_prevista=dados.data_entrega_prevista,
        valor_total=round(valor_total, 2),
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
    # Trava o pedido: recebimentos e cancelamentos simultâneos do mesmo pedido passam um de cada vez
    pedido = (
        db.query(PedidoCompra)
        .filter(PedidoCompra.id == pedido_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")

    if pedido.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível registrar recebimento em pedidos 'pendente'. Status atual: '{pedido.status}'"
        )

    if not dados.itens:
        raise HTTPException(status_code=400, detail="Informe ao menos um item recebido")

    todos_itens = db.query(ItemPedidoCompra).filter(ItemPedidoCompra.pedido_compra_id == pedido.id).all()
    itens_do_pedido = {item.id: item for item in todos_itens}

    # Se o mesmo item vier mais de uma vez na requisição, as quantidades são somadas
    recebido_agora = defaultdict(Decimal)
    for entrada in dados.itens:
        if entrada.item_id not in itens_do_pedido:
            raise HTTPException(status_code=404, detail=f"Item {entrada.item_id} não pertence a este pedido")
        recebido_agora[entrada.item_id] += entrada.quantidade_recebida_agora

    produtos = travar_produtos(db, [itens_do_pedido[i].produto_id for i in recebido_agora])

    for item_id, quantidade in recebido_agora.items():
        item = itens_do_pedido[item_id]
        restante = item.quantidade - item.quantidade_recebida
        if quantidade > restante:
            produto = produtos[item.produto_id]
            raise HTTPException(
                status_code=400,
                detail=f"Quantidade recebida excede o restante para '{produto.nome}'. "
                       f"Restante a receber: {restante:.3f}, informado: {quantidade:.3f}"
            )

    for item_id, quantidade in recebido_agora.items():
        item = itens_do_pedido[item_id]
        produtos[item.produto_id].estoque_atual += quantidade
        item.quantidade_recebida += quantidade

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
    pedido = (
        db.query(PedidoCompra)
        .filter(PedidoCompra.id == pedido_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")

    novo_status = dados.status
    if novo_status != "cancelado":
        raise HTTPException(
            status_code=400,
            detail="Use este endpoint apenas para cancelar. O status 'recebido' é definido automaticamente via /receber."
        )

    if pedido.status == "cancelado":
        raise HTTPException(status_code=400, detail="Pedido já está cancelado")

    itens = db.query(ItemPedidoCompra).filter(ItemPedidoCompra.pedido_compra_id == pedido.id).all()

    # Total já recebido (parcial ou total) por produto, a ser estornado do estoque
    a_estornar = defaultdict(Decimal)
    for item in itens:
        if item.quantidade_recebida > 0:
            a_estornar[item.produto_id] += item.quantidade_recebida

    produtos = travar_produtos(db, a_estornar.keys())

    # O estorno só pode sair do que está LIVRE: o que já foi vendido ou está reservado
    # em pedidos de venda abertos não pode ser tirado do estoque.
    for produto_id, quantidade in a_estornar.items():
        produto = produtos[produto_id]
        disponivel = produto.estoque_atual - produto.estoque_reservado
        if disponivel < quantidade:
            raise HTTPException(
                status_code=400,
                detail=f"Não é possível cancelar: '{produto.nome}' tem {disponivel:.3f} disponível e este pedido "
                       f"recebeu {quantidade:.3f}. Parte da mercadoria já foi vendida ou está reservada em "
                       f"pedidos de venda."
            )

    for produto_id, quantidade in a_estornar.items():
        produtos[produto_id].estoque_atual -= quantidade

    pedido.status = "cancelado"

    db.commit()
    db.refresh(pedido)
    return pedido
