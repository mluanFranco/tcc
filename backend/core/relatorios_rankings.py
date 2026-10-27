"""
Rankings do financeiro: compras por fornecedor e por produto, vendas por produto e por cliente,
e formas de pagamento (valor, prazo médio e taxa).

Mesmas regras do resumo (12c.1):
- Venda conta quando CONFIRMADA (confirmado_em); receita = subtotal dos itens; CMV = quantidade x custo congelado.
- Compra conta quando NÃO cancelada, pela data do pedido.
- Quantidades e preços médios/mínimos/máximos dos rankings de produto ficam na unidade BASE (quantidade x fator do item),
  então "unidade" é sempre a sigla base (L, kg, un) mesmo para produtos vendidos em embalagem.
Os totais são do período inteiro; `limite` só corta a lista exibida.
Tudo é somado em SQL (decimais exatos) e arredondado só na saída.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Numeric, case, cast, func, or_
from sqlalchemy.orm import Session

from core.relatorios import _dinheiro, _percentual
from models import (
    Cliente, Fornecedor, FormaPagamento, ItemPedidoCompra, ItemPedidoVenda, PedidoCompra, PedidoVenda,
    Produto, TituloFinanceiro, UnidadeMedida,
)

_ZERO = Decimal("0")
_DECIMO = Decimal("0.1")
ORDENACOES_PRODUTO_VENDA = ("receita", "quantidade", "margem")
ORDENACOES_PRODUTO_COMPRA = ("total", "quantidade")
SEM_FORMA = "Sem forma de pagamento (pedidos antigos)"


def _janela(inicio: date, fim: date):
    return datetime.combine(inicio, time.min), datetime.combine(fim + timedelta(days=1), time.min)


def _venda_no_periodo(inicio: date, fim: date):
    ini, fim_dt = _janela(inicio, fim)
    return [PedidoVenda.status == "confirmado", PedidoVenda.confirmado_em >= ini, PedidoVenda.confirmado_em < fim_dt]


def _compra_no_periodo(inicio: date, fim: date):
    ini, fim_dt = _janela(inicio, fim)
    return [PedidoCompra.status != "cancelado", PedidoCompra.data_pedido >= ini, PedidoCompra.data_pedido < fim_dt]


_RECEITA = func.sum(cast(ItemPedidoVenda.subtotal, Numeric(14, 2)))
_CMV = func.sum(ItemPedidoVenda.quantidade * func.coalesce(ItemPedidoVenda.custo_unitario, 0))
_SEM_CUSTO = func.sum(case((or_(ItemPedidoVenda.custo_unitario.is_(None), ItemPedidoVenda.custo_unitario == 0), 1), else_=0))


def _media(total: Decimal, divisor) -> Optional[Decimal]:
    return _dinheiro(total / divisor) if divisor else None


def _participacao(parte: Decimal, total: Decimal) -> Optional[Decimal]:
    return _percentual(parte, total)


def _posicionar(linhas: List[dict], chave, limite: int) -> List[dict]:
    ordenadas = sorted(linhas, key=chave)[:limite]
    return [{"posicao": i + 1, **l} for i, l in enumerate(ordenadas)]


def _totais_vendas(db: Session, inicio: date, fim: date) -> dict:
    pedidos, receita, cmv, sem_custo = (
        db.query(func.count(func.distinct(PedidoVenda.id)), _RECEITA, _CMV, _SEM_CUSTO)
        .select_from(PedidoVenda)
        .join(ItemPedidoVenda, ItemPedidoVenda.pedido_venda_id == PedidoVenda.id)
        .filter(*_venda_no_periodo(inicio, fim))
        .one()
    )
    receita, cmv = _dinheiro(receita), _dinheiro(cmv)
    margem = receita - cmv
    return {
        "pedidos": int(pedidos or 0), "receita": receita, "cmv": cmv, "margem_bruta": margem,
        "margem_percentual": _percentual(margem, receita), "itens_sem_custo": int(sem_custo or 0),
    }


# ---------------------------------------------------------------- compras

def compras_por_fornecedor(db: Session, inicio: date, fim: date, limite: int) -> dict:
    total_pedido = cast(PedidoCompra.valor_total, Numeric(14, 2))
    linhas = [
        {"fornecedor_id": fid, "fornecedor_nome": nome, "pedidos": int(n), "total": Decimal(total or 0),
         "ultima_compra": ultima.date()}
        for fid, nome, n, total, ultima in (
            db.query(Fornecedor.id, Fornecedor.nome, func.count(PedidoCompra.id), func.sum(total_pedido), func.max(PedidoCompra.data_pedido))
            .join(Fornecedor, Fornecedor.id == PedidoCompra.fornecedor_id)
            .filter(*_compra_no_periodo(inicio, fim))
            .group_by(Fornecedor.id, Fornecedor.nome)
        )
    ]
    geral = sum((l["total"] for l in linhas), _ZERO)
    itens = [
        {**l, "total": _dinheiro(l["total"]), "ticket_medio": _media(l["total"], l["pedidos"]),
         "participacao_percentual": _participacao(l["total"], geral)}
        for l in _posicionar(linhas, lambda l: (-l["total"], l["fornecedor_nome"]), limite)
    ]
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "limite": limite, "fornecedores_no_periodo": len(linhas),
        "totais": {"pedidos": sum(l["pedidos"] for l in linhas), "total": _dinheiro(geral)}, "itens": itens,
    }


def compras_por_produto(db: Session, inicio: date, fim: date, limite: int, ordenar_por: str) -> dict:
    filtro = _compra_no_periodo(inicio, fim)
    linhas = [
        {"produto_id": pid, "produto_nome": nome, "unidade": sigla, "pedidos": int(n), "quantidade": Decimal(qtd or 0),
         "total": Decimal(total or 0), "preco_minimo": _dinheiro(pmin), "preco_maximo": _dinheiro(pmax)}
        for pid, nome, sigla, n, qtd, total, pmin, pmax in (
            db.query(
                Produto.id, Produto.nome, UnidadeMedida.sigla, func.count(func.distinct(PedidoCompra.id)),
                # quantidades e preços na unidade BASE (litro, kg...): não mistura potes com litros se a embalagem mudar
                func.sum(ItemPedidoCompra.quantidade * ItemPedidoCompra.fator), func.sum(cast(ItemPedidoCompra.subtotal, Numeric(14, 2))),
                func.min(ItemPedidoCompra.preco_unitario / ItemPedidoCompra.fator), func.max(ItemPedidoCompra.preco_unitario / ItemPedidoCompra.fator),
            )
            .select_from(ItemPedidoCompra)
            .join(PedidoCompra, PedidoCompra.id == ItemPedidoCompra.pedido_compra_id)
            .join(Produto, Produto.id == ItemPedidoCompra.produto_id)
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_medida_id)
            .filter(*filtro)
            .group_by(Produto.id, Produto.nome, UnidadeMedida.sigla)
        )
    ]
    geral = sum((l["total"] for l in linhas), _ZERO)
    chave = (lambda l: (-l["quantidade"], l["produto_nome"])) if ordenar_por == "quantidade" else (lambda l: (-l["total"], l["produto_nome"]))
    escolhidas = _posicionar(linhas, chave, limite)

    ultimo = {}
    if escolhidas:
        for pid, preco in (
            db.query(ItemPedidoCompra.produto_id, ItemPedidoCompra.preco_unitario / ItemPedidoCompra.fator)
            .join(PedidoCompra, PedidoCompra.id == ItemPedidoCompra.pedido_compra_id)
            .filter(*filtro, ItemPedidoCompra.produto_id.in_([l["produto_id"] for l in escolhidas]))
            .order_by(ItemPedidoCompra.produto_id, PedidoCompra.data_pedido.desc(), ItemPedidoCompra.id.desc())
        ):
            ultimo.setdefault(pid, _dinheiro(preco))
    itens = [
        {**l, "total": _dinheiro(l["total"]), "preco_medio": _media(l["total"], l["quantidade"]),
         "ultimo_preco": ultimo[l["produto_id"]], "participacao_percentual": _participacao(l["total"], geral)}
        for l in escolhidas
    ]
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "limite": limite, "ordenar_por": ordenar_por,
        "produtos_no_periodo": len(linhas), "total": _dinheiro(geral), "itens": itens,
    }


# ---------------------------------------------------------------- vendas

def _fechar_venda(l: dict, receita_geral: Decimal) -> dict:
    receita, cmv = _dinheiro(l["receita"]), _dinheiro(l["cmv"])
    margem = receita - cmv
    return {**l, "receita": receita, "cmv": cmv, "margem_bruta": margem,
            "margem_percentual": _percentual(margem, receita),
            "participacao_percentual": _participacao(l["receita"], receita_geral)}


def vendas_por_produto(db: Session, inicio: date, fim: date, limite: int, ordenar_por: str) -> dict:
    linhas = [
        {"produto_id": pid, "produto_nome": nome, "unidade": sigla, "pedidos": int(n), "quantidade": Decimal(qtd or 0),
         "receita": Decimal(receita or 0), "cmv": Decimal(cmv or 0), "itens_sem_custo": int(sem or 0)}
        for pid, nome, sigla, n, qtd, receita, cmv, sem in (
            db.query(
                Produto.id, Produto.nome, UnidadeMedida.sigla, func.count(func.distinct(PedidoVenda.id)),
                func.sum(ItemPedidoVenda.quantidade * ItemPedidoVenda.fator), _RECEITA, _CMV, _SEM_CUSTO,   # quantidade na unidade base
            )
            .select_from(ItemPedidoVenda)
            .join(PedidoVenda, PedidoVenda.id == ItemPedidoVenda.pedido_venda_id)
            .join(Produto, Produto.id == ItemPedidoVenda.produto_id)
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_medida_id)
            .filter(*_venda_no_periodo(inicio, fim))
            .group_by(Produto.id, Produto.nome, UnidadeMedida.sigla)
        )
    ]
    receita_geral = sum((l["receita"] for l in linhas), _ZERO)
    if ordenar_por == "quantidade":
        chave = lambda l: (-l["quantidade"], l["produto_nome"])
    elif ordenar_por == "margem":
        chave = lambda l: (-(_dinheiro(l["receita"]) - _dinheiro(l["cmv"])), l["produto_nome"])
    else:
        chave = lambda l: (-l["receita"], l["produto_nome"])
    itens = []
    for l in _posicionar(linhas, chave, limite):
        itens.append({**_fechar_venda(l, receita_geral), "preco_medio": _media(l["receita"], l["quantidade"])})
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "limite": limite, "ordenar_por": ordenar_por,
        "produtos_no_periodo": len(linhas), "totais": _totais_vendas(db, inicio, fim), "itens": itens,
    }


def vendas_por_cliente(db: Session, inicio: date, fim: date, limite: int) -> dict:
    linhas = [
        {"cliente_id": cid, "cliente_nome": nome, "pedidos": int(n), "receita": Decimal(receita or 0),
         "cmv": Decimal(cmv or 0), "ultima_compra": ultima.date()}
        for cid, nome, n, receita, cmv, ultima in (
            db.query(
                Cliente.id, Cliente.nome, func.count(func.distinct(PedidoVenda.id)), _RECEITA, _CMV,
                func.max(PedidoVenda.confirmado_em),
            )
            .select_from(PedidoVenda)
            .join(ItemPedidoVenda, ItemPedidoVenda.pedido_venda_id == PedidoVenda.id)
            .join(Cliente, Cliente.id == PedidoVenda.cliente_id)
            .filter(*_venda_no_periodo(inicio, fim))
            .group_by(Cliente.id, Cliente.nome)
        )
    ]
    receita_geral = sum((l["receita"] for l in linhas), _ZERO)
    itens = []
    for l in _posicionar(linhas, lambda l: (-l["receita"], l["cliente_nome"]), limite):
        itens.append({**_fechar_venda(l, receita_geral), "ticket_medio": _media(l["receita"], l["pedidos"])})
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "limite": limite, "clientes_no_periodo": len(linhas),
        "totais": _totais_vendas(db, inicio, fim), "itens": itens,
    }


# ---------------------------------------------------------------- formas de pagamento

def _prazo(soma_valor: Decimal, soma_valor_dias: Decimal) -> Optional[Decimal]:
    if not soma_valor:
        return None
    return (soma_valor_dias / soma_valor).quantize(_DECIMO)


def por_forma_pagamento(db: Session, inicio: date, fim: date, origem: str) -> dict:
    venda = origem == "venda"
    pedido = PedidoVenda if venda else PedidoCompra
    filtro = _venda_no_periodo(inicio, fim) if venda else _compra_no_periodo(inicio, fim)
    base = PedidoVenda.confirmado_em if venda else PedidoCompra.data_pedido
    fk = TituloFinanceiro.pedido_venda_id if venda else TituloFinanceiro.pedido_compra_id

    if venda:
        valor = _RECEITA
        consulta = (
            db.query(pedido.forma_pagamento_id, func.count(func.distinct(pedido.id)), valor)
            .select_from(PedidoVenda)
            .join(ItemPedidoVenda, ItemPedidoVenda.pedido_venda_id == PedidoVenda.id)
        )
    else:
        consulta = db.query(pedido.forma_pagamento_id, func.count(pedido.id), func.sum(cast(PedidoCompra.valor_total, Numeric(14, 2))))
    por_forma = {
        fid: {"pedidos": int(n), "total": Decimal(total or 0), "valor_titulos": _ZERO, "valor_dias": _ZERO, "taxa": _ZERO}
        for fid, n, total in consulta.filter(*filtro).group_by(pedido.forma_pagamento_id)
    }

    dias = func.datediff(TituloFinanceiro.vencimento, func.date(base))
    for fid, soma, soma_dias, taxa in (
        db.query(
            pedido.forma_pagamento_id, func.sum(TituloFinanceiro.valor), func.sum(TituloFinanceiro.valor * dias),
            func.sum(func.round(TituloFinanceiro.valor * TituloFinanceiro.taxa_percentual / 100, 2)),
        )
        .select_from(TituloFinanceiro)
        .join(pedido, pedido.id == fk)
        .filter(TituloFinanceiro.status != "cancelado", *filtro)
        .group_by(pedido.forma_pagamento_id)
    ):
        if fid in por_forma:
            por_forma[fid].update(valor_titulos=Decimal(soma or 0), valor_dias=Decimal(soma_dias or 0), taxa=Decimal(taxa or 0))

    nomes = {f.id: f.descricao for f in db.query(FormaPagamento.id, FormaPagamento.descricao)}
    geral = sum((l["total"] for l in por_forma.values()), _ZERO)
    linhas = []
    for fid, l in por_forma.items():
        linhas.append({
            "forma_pagamento_id": fid, "forma_pagamento": nomes.get(fid, SEM_FORMA), "pedidos": l["pedidos"],
            "total": _dinheiro(l["total"]), "participacao_percentual": _participacao(l["total"], geral),
            "prazo_medio_dias": _prazo(l["valor_titulos"], l["valor_dias"]),
            "taxa_estimada": _dinheiro(l["taxa"]) if venda else None,
        })
    linhas.sort(key=lambda l: (-l["total"], l["forma_pagamento"]))
    itens = [{"posicao": i + 1, **l} for i, l in enumerate(linhas)]
    soma_titulos = sum((l["valor_titulos"] for l in por_forma.values()), _ZERO)
    soma_dias = sum((l["valor_dias"] for l in por_forma.values()), _ZERO)
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "origem": origem,
        "totais": {
            "pedidos": sum(l["pedidos"] for l in por_forma.values()), "total": _dinheiro(geral),
            "prazo_medio_dias": _prazo(soma_titulos, soma_dias),
            "taxa_estimada": _dinheiro(sum((l["taxa"] for l in por_forma.values()), _ZERO)) if venda else None,
        },
        "itens": itens,
    }
