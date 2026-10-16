"""
Criação de pedidos (venda e compra) em um único lugar.

É usado pelas rotas de pedido e também pela aprovação de cotação, para que as duas
formas de gerar um pedido sigam EXATAMENTE as mesmas regras (clientes/fornecedores/produtos
ativos, travamento de linhas de estoque, reserva na venda, cálculo de totais).

As funções NÃO fazem commit: quem chama decide quando confirmar a transação. Se algo falhar
(HTTPException), nada foi gravado de forma definitiva — a transação simplesmente não é confirmada.
"""
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from core.estoque import travar_produtos
from core.financeiro import gerar_titulos
from models import (
    PedidoVenda, ItemPedidoVenda, PedidoCompra, ItemPedidoCompra,
    Cliente, ClienteEndereco, Fornecedor, FormaPagamento,
)
from schemas.pedido_venda import PedidoVendaCreate
from schemas.pedido_compra import PedidoCompraCreate


def _validar_forma_pagamento(db: Session, forma_pagamento_id) -> FormaPagamento:
    if forma_pagamento_id is None:
        raise HTTPException(status_code=400, detail="Informe a forma de pagamento: é dela que saem as parcelas do financeiro")
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_pagamento_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
    if not forma.ativo:
        raise HTTPException(status_code=400, detail="A forma de pagamento selecionada está inativa")
    return forma


def registrar_pedido_venda(db: Session, usuario_id: int, dados: PedidoVendaCreate) -> PedidoVenda:
    if not dados.itens:
        raise HTTPException(status_code=400, detail="O pedido deve conter ao menos um item")

    cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if not cliente.ativo:
        raise HTTPException(status_code=400, detail="O cliente selecionado está inativo")

    _validar_forma_pagamento(db, dados.forma_pagamento_id)   # na venda, os títulos nascem na confirmação

    if dados.endereco_entrega_id is not None:
        endereco = db.query(ClienteEndereco).filter(ClienteEndereco.id == dados.endereco_entrega_id).first()
        if not endereco or endereco.cliente_id != cliente.id:
            raise HTTPException(status_code=400, detail="O endereço de entrega informado não pertence a este cliente")
        if not endereco.ativo:
            raise HTTPException(status_code=400, detail="O endereço de entrega selecionado está inativo")

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
        usuario_id=usuario_id,
        data_pedido=datetime.now(),
        valor_total=round(valor_total, 2),
        status="aberto",
        forma_pagamento_id=dados.forma_pagamento_id,
        endereco_entrega_id=dados.endereco_entrega_id,
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

    db.flush()
    return pedido


def registrar_pedido_compra(db: Session, usuario_id: int, dados: PedidoCompraCreate) -> PedidoCompra:
    if not dados.itens:
        raise HTTPException(status_code=400, detail="O pedido deve conter ao menos um item")

    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == dados.fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    if not fornecedor.ativo:
        raise HTTPException(status_code=400, detail="O fornecedor selecionado está inativo")

    forma = _validar_forma_pagamento(db, dados.forma_pagamento_id)

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
        usuario_id=usuario_id,
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

    db.flush()
    # Contas a pagar: nascem junto com o pedido, vencendo a partir da data do pedido
    gerar_titulos(db, tipo="pagar", pedido=pedido, forma=forma, data_base=pedido.data_pedido.date())
    return pedido
