from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoCompra, ItemPedidoCompra, Usuario, TituloFinanceiro
from schemas.pedido_compra import (
    PedidoCompraCreate, PedidoCompraStatusUpdate,
    PedidoCompraResponse, RegistrarRecebimento
)
from core.security import get_current_user
from core.estoque import travar_produtos
from core.pedidos import registrar_pedido_compra
from core.financeiro import cancelar_titulos_do_pedido
from schemas.financeiro import TituloResponse
from typing import List
from collections import defaultdict
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/pedidos-compra", tags=["Pedidos de Compra"])


@router.post("/", response_model=PedidoCompraResponse)
def criar_pedido_compra(
    dados: PedidoCompraCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    # As regras de criação (validações e travamento de produtos) ficam em core/pedidos.py,
    # compartilhadas com a aprovação de cotação.
    pedido = registrar_pedido_compra(db, usuario.id, dados)
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


@router.get("/{pedido_id}/titulos", response_model=List[TituloResponse])
def titulos_do_pedido_compra(pedido_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Contas a pagar geradas por este pedido (nascem junto com o pedido)."""
    if not db.query(PedidoCompra.id).filter(PedidoCompra.id == pedido_id).first():
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")
    return (
        db.query(TituloFinanceiro)
        .options(joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor), joinedload(TituloFinanceiro.categoria))
        .filter(TituloFinanceiro.pedido_compra_id == pedido_id)
        .order_by(TituloFinanceiro.numero_parcela)
        .all()
    )


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

    # Cancela as contas a pagar antes de mexer em estoque (barra se algum título já tiver pagamento lançado)
    cancelar_titulos_do_pedido(db, tipo="pagar", pedido_id=pedido.id)

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
