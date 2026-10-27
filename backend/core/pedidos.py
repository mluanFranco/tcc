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

from core.estoque import quantidade_base, travar_produtos
from core.financeiro import gerar_titulos
from models import (
    PedidoVenda, ItemPedidoVenda, PedidoCompra, ItemPedidoCompra,
    Cliente, ClienteEndereco, Fornecedor, FormaPagamento,
)
from schemas.pedido_venda import PedidoVendaCreate
from schemas.pedido_compra import PedidoCompraCreate


def _texto_qtd(quantidade_na_base: Decimal, produto) -> str:
    """'10.000 L (2.000 Pote)' para produto com embalagem; '10.000 L' sem embalagem."""
    base = produto.unidade_medida.sigla if produto.unidade_medida else ""
    texto = f"{quantidade_na_base:.3f} {base}".strip()
    if produto.embalagem_unidade_id is not None and produto.fator_embalagem:
        emb = produto.embalagem_unidade.sigla if produto.embalagem_unidade else "emb."
        texto += f" ({quantidade_na_base / Decimal(produto.fator_embalagem):.3f} {emb})"
    return texto


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
    # A quantidade do item está na embalagem (ex.: potes); o estoque está na unidade base (ex.: litros).
    solicitado = defaultdict(Decimal)
    for item in dados.itens:
        solicitado[item.produto_id] += quantidade_base(item.quantidade, produtos[item.produto_id].fator_embalagem)

    for produto_id, quantidade in solicitado.items():
        produto = produtos[produto_id]
        disponivel = produto.estoque_atual - produto.estoque_reservado
        if quantidade > disponivel:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque disponível insuficiente para '{produto.nome}'. "
                       f"Disponível: {_texto_qtd(disponivel, produto)}, solicitado: {_texto_qtd(quantidade, produto)}"
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
        produto = produtos[item.produto_id]
        db.add(ItemPedidoVenda(
            pedido_venda_id=pedido.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            fator=produto.fator_embalagem,     # congela a conversão: mudar o cadastro depois não afeta este pedido
            preco_unitario=item.preco_unitario,
            desconto=item.desconto,
            subtotal=subtotal
        ))
        produto.estoque_reservado += quantidade_base(item.quantidade, produto.fator_embalagem)  # reserva, não debita ainda

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
            fator=produtos[item.produto_id].fator_embalagem,   # o recebimento entra no estoque como quantidade x fator
            preco_unitario=item.preco_unitario,
            subtotal=subtotal
        ))

    db.flush()
    # Contas a pagar: nascem junto com o pedido, vencendo a partir da data do pedido
    gerar_titulos(db, tipo="pagar", pedido=pedido, forma=forma, data_base=pedido.data_pedido.date())
    return pedido
