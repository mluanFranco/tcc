from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PedidoVenda, ItemPedidoVenda, Cliente, FormaPagamento, Usuario
from schemas.pedido_venda import PedidoVendaCreate, PedidoVendaStatusUpdate, PedidoVendaResponse
from core.security import get_current_user
from core.estoque import travar_produtos
from typing import List
from collections import defaultdict
from decimal import Decimal
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

    cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if not cliente.ativo:
        raise HTTPException(status_code=400, detail="O cliente selecionado está inativo")

    if dados.forma_pagamento_id is not None:
        forma = db.query(FormaPagamento).filter(FormaPagamento.id == dados.forma_pagamento_id).first()
        if not forma:
            raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
        if not forma.ativo:
            raise HTTPException(status_code=400, detail="A forma de pagamento selecionada está inativa")

    # Trava os produtos envolvidos até o fim da transação: se outro pedido estiver
    # reservando o mesmo produto neste instante, esta requisição espera e depois
    # enxerga o saldo já atualizado.
    produtos = travar_produtos(db, [item.produto_id for item in dados.itens])

    # Existência e situação dos produtos
    # (vender produto que é apenas insumo é permitido: pode haver revenda)
    for item in dados.itens:
        produto = produtos.get(item.produto_id)
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")
        if not produto.ativo:
            raise HTTPException(status_code=400, detail=f"O produto '{produto.nome}' está inativo")

    # Disponibilidade: soma as linhas do mesmo produto antes de comparar com o saldo,
    # senão duas linhas do mesmo produto passariam, cada uma, sozinha.
    solicitado = defaultdict(Decimal)
    for item in dados.itens:
        solicitado[item.produto_id] += item.quantidade

    for produto_id, quantidade in solicitado.items():
        produto = produtos[produto_id]
        disponivel = produto.estoque_atual - produto.estoque_reservado
        if quantidade > disponivel:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque disponível insuficiente para '{produto.nome}'. "
                       f"Disponível: {disponivel:.3f}, solicitado: {quantidade:.3f}"
            )

    valor_total = 0.0
    itens_para_criar = []
    for item in dados.itens:
        subtotal = max(0.0, round(item.preco_unitario * float(item.quantidade) - item.desconto, 2))
        valor_total += subtotal
        itens_para_criar.append((item, subtotal))

    pedido = PedidoVenda(
        cliente_id=dados.cliente_id,
        usuario_id=usuario.id,
        data_pedido=datetime.now(),
        valor_total=round(valor_total, 2),
        status="aberto",
        forma_pagamento_id=dados.forma_pagamento_id,
        observacao=dados.observacao
    )
    db.add(pedido)
    db.flush()  # garante pedido.id disponível sem commitar ainda

    for item, subtotal in itens_para_criar:
        db.add(ItemPedidoVenda(
            pedido_venda_id=pedido.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            preco_unitario=item.preco_unitario,
            desconto=item.desconto,
            subtotal=subtotal
        ))
        produtos[item.produto_id].estoque_reservado += item.quantidade  # reserva, não debita ainda

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
