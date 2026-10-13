"""
Relatórios do financeiro (regime de competência): resumo, série por período e comparativo.

Tudo parte de UMA coleta (`coletar`): o SQL agrega por dia e o Python soma por período.
Assim o resumo e a série usam exatamente os mesmos números, e a soma da série fecha com o resumo.

Regras (combinadas no item 12c):
- Venda conta quando CONFIRMADA (pedido_venda.confirmado_em); receita = subtotal dos itens (já com desconto).
- CMV = quantidade x custo_unitario congelado na confirmação. Margem bruta = receita - CMV.
- Compras (pedidos não cancelados, pela data do pedido) aparecem como investimento em estoque:
  NÃO entram no resultado, porque viram custo só quando o produto é vendido (CMV).
- Despesas e outras receitas = lançamentos avulsos não cancelados, pela data de vencimento.
- Resultado = margem bruta + outras receitas - despesas.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import Numeric, case, cast, func, or_
from sqlalchemy.orm import Session

from core.financeiro import somar_meses
from models import (
    CategoriaFinanceira, ItemPedidoVenda, PedidoCompra, PedidoVenda, TituloFinanceiro,
)

_CENTAVO = Decimal("0.01")
_ZERO = Decimal("0")
MAX_DIAS_PERIODO = 1827   # 5 anos

AGRUPAMENTOS = ("mes", "trimestre", "estacao", "ano")
_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
_NOME_ESTACAO = {"verao": "Verão", "outono": "Outono", "inverno": "Inverno", "primavera": "Primavera"}


def _dinheiro(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(_CENTAVO, rounding=ROUND_HALF_UP)


def _percentual(parte: Decimal, total: Decimal) -> Optional[Decimal]:
    if not total:
        return None
    return (parte / total * 100).quantize(_CENTAVO, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------- período

def resolver_periodo(data_inicio: Optional[date], data_fim: Optional[date]) -> Tuple[date, date]:
    """Sem datas: do 1º de janeiro do ano corrente até hoje. Ambas as datas são inclusivas."""
    fim = data_fim or date.today()
    inicio = data_inicio or date(fim.year, 1, 1)
    if inicio > fim:
        raise HTTPException(status_code=400, detail="data_inicio não pode ser maior que data_fim")
    if (fim - inicio).days > MAX_DIAS_PERIODO:
        raise HTTPException(status_code=400, detail="O período não pode passar de 5 anos")
    return inicio, fim


# ---------------------------------------------------------------- agrupamento

def inicio_do_grupo(dia: date, agrupamento: str) -> date:
    if agrupamento == "mes":
        return date(dia.year, dia.month, 1)
    if agrupamento == "trimestre":
        return date(dia.year, 3 * ((dia.month - 1) // 3) + 1, 1)
    if agrupamento == "ano":
        return date(dia.year, 1, 1)
    # estação, por meses fechados do hemisfério sul: verão dez-fev, outono mar-mai, inverno jun-ago, primavera set-nov
    if dia.month == 12:
        return date(dia.year, 12, 1)
    if dia.month in (1, 2):
        return date(dia.year - 1, 12, 1)
    return date(dia.year, 3 * ((dia.month - 3) // 3) + 3, 1)


def proximo_grupo(inicio: date, agrupamento: str) -> date:
    return somar_meses(inicio, {"mes": 1, "trimestre": 3, "estacao": 3, "ano": 12}[agrupamento])


def identificar_grupo(inicio: date, agrupamento: str) -> Tuple[str, str]:
    if agrupamento == "mes":
        return f"{inicio.year}-{inicio.month:02d}", f"{_MESES[inicio.month - 1]}/{inicio.year}"
    if agrupamento == "trimestre":
        numero = (inicio.month - 1) // 3 + 1
        return f"{inicio.year}-T{numero}", f"{numero}º tri/{inicio.year}"
    if agrupamento == "ano":
        return str(inicio.year), str(inicio.year)
    chave = {12: "verao", 3: "outono", 6: "inverno", 9: "primavera"}[inicio.month]
    nome = _NOME_ESTACAO[chave]
    rotulo = f"{nome} {inicio.year}/{inicio.year + 1}" if chave == "verao" else f"{nome} {inicio.year}"
    return f"{inicio.year}-{chave}", rotulo


def grupos_do_periodo(inicio: date, fim: date, agrupamento: str):
    """Todos os grupos que tocam o período (inclusive os vazios), com datas cortadas no período."""
    atual = inicio_do_grupo(inicio, agrupamento)
    while atual <= fim:
        seguinte = proximo_grupo(atual, agrupamento)
        chave, rotulo = identificar_grupo(atual, agrupamento)
        yield {
            "inicio_grupo": atual, "chave": chave, "rotulo": rotulo,
            "inicio": max(atual, inicio), "fim": min(seguinte - timedelta(days=1), fim),
        }
        atual = seguinte


# ---------------------------------------------------------------- coleta

def coletar(db: Session, inicio: date, fim: date) -> dict:
    ini_dt = datetime.combine(inicio, time.min)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min)

    dia_venda = func.date(PedidoVenda.confirmado_em)
    sem_custo = case((or_(ItemPedidoVenda.custo_unitario.is_(None), ItemPedidoVenda.custo_unitario == 0), 1), else_=0)
    vendas = {}
    for dia, pedidos, receita, cmv, itens_sem_custo in (
        db.query(
            dia_venda,
            func.count(func.distinct(PedidoVenda.id)),
            func.sum(cast(ItemPedidoVenda.subtotal, Numeric(14, 2))),
            func.sum(ItemPedidoVenda.quantidade * func.coalesce(ItemPedidoVenda.custo_unitario, 0)),
            func.sum(sem_custo),
        )
        .join(ItemPedidoVenda, ItemPedidoVenda.pedido_venda_id == PedidoVenda.id)
        .filter(PedidoVenda.status == "confirmado", PedidoVenda.confirmado_em >= ini_dt, PedidoVenda.confirmado_em < fim_dt)
        .group_by(dia_venda)
    ):
        vendas[dia] = {
            "pedidos": int(pedidos), "receita": Decimal(receita or 0), "cmv": Decimal(cmv or 0),
            "itens_sem_custo": int(itens_sem_custo or 0),
        }

    dia_compra = func.date(PedidoCompra.data_pedido)
    compras = {}
    for dia, pedidos, total in (
        db.query(dia_compra, func.count(PedidoCompra.id), func.sum(cast(PedidoCompra.valor_total, Numeric(14, 2))))
        .filter(PedidoCompra.status != "cancelado", PedidoCompra.data_pedido >= ini_dt, PedidoCompra.data_pedido < fim_dt)
        .group_by(dia_compra)
    ):
        compras[dia] = {"pedidos": int(pedidos), "total": Decimal(total or 0)}

    avulsos = [
        {"dia": dia, "tipo": tipo, "categoria_id": cid, "categoria_nome": nome, "quantidade": int(qtd), "total": Decimal(total or 0)}
        for dia, tipo, cid, nome, qtd, total in (
            db.query(
                TituloFinanceiro.vencimento, TituloFinanceiro.tipo, TituloFinanceiro.categoria_id,
                CategoriaFinanceira.nome, func.count(TituloFinanceiro.id), func.sum(TituloFinanceiro.valor),
            )
            .join(CategoriaFinanceira, CategoriaFinanceira.id == TituloFinanceiro.categoria_id)
            .filter(
                TituloFinanceiro.pedido_venda_id.is_(None), TituloFinanceiro.pedido_compra_id.is_(None),
                TituloFinanceiro.status != "cancelado",
                TituloFinanceiro.vencimento >= inicio, TituloFinanceiro.vencimento <= fim,
            )
            .group_by(TituloFinanceiro.vencimento, TituloFinanceiro.tipo, TituloFinanceiro.categoria_id, CategoriaFinanceira.nome)
        )
    ]
    return {"vendas": vendas, "compras": compras, "avulsos": avulsos}


# ---------------------------------------------------------------- agregação

def _somar(dados: dict, de: date, ate: date) -> dict:
    """Soma o que a coleta trouxe entre `de` e `ate` (inclusivos)."""
    v = {"pedidos": 0, "receita": _ZERO, "cmv": _ZERO, "itens_sem_custo": 0}
    for dia, linha in dados["vendas"].items():
        if de <= dia <= ate:
            v["pedidos"] += linha["pedidos"]; v["receita"] += linha["receita"]
            v["cmv"] += linha["cmv"]; v["itens_sem_custo"] += linha["itens_sem_custo"]
    c = {"pedidos": 0, "total": _ZERO}
    for dia, linha in dados["compras"].items():
        if de <= dia <= ate:
            c["pedidos"] += linha["pedidos"]; c["total"] += linha["total"]
    categorias: Dict[tuple, dict] = {}
    outras_receitas = despesas = _ZERO
    for linha in dados["avulsos"]:
        if de <= linha["dia"] <= ate:
            chave = (linha["tipo"], linha["categoria_id"])
            cat = categorias.setdefault(chave, {
                "categoria_id": linha["categoria_id"], "categoria_nome": linha["categoria_nome"],
                "tipo": linha["tipo"], "quantidade": 0, "total": _ZERO,
            })
            cat["quantidade"] += linha["quantidade"]; cat["total"] += linha["total"]
            if linha["tipo"] == "receber":
                outras_receitas += linha["total"]
            else:
                despesas += linha["total"]

    receita, cmv = _dinheiro(v["receita"]), _dinheiro(v["cmv"])
    margem = receita - cmv
    outras, desp = _dinheiro(outras_receitas), _dinheiro(despesas)
    return {
        "vendas": {
            "pedidos": v["pedidos"], "receita": receita, "cmv": cmv, "margem_bruta": margem,
            "margem_percentual": _percentual(margem, receita), "itens_sem_custo": v["itens_sem_custo"],
        },
        "compras": {"pedidos": c["pedidos"], "total": _dinheiro(c["total"])},
        "outras_receitas": outras,
        "despesas": desp,
        "por_categoria": sorted(
            ({**c, "total": _dinheiro(c["total"])} for c in categorias.values()),
            key=lambda c: (c["tipo"], c["categoria_nome"]),
        ),
        "resultado": margem + outras - desp,
    }


def resumo(db: Session, inicio: date, fim: date) -> dict:
    dados = coletar(db, inicio, fim)
    return {"periodo": {"inicio": inicio, "fim": fim}, **_somar(dados, inicio, fim)}


def serie(db: Session, inicio: date, fim: date, agrupamento: str) -> dict:
    dados = coletar(db, inicio, fim)
    itens = []
    for g in grupos_do_periodo(inicio, fim, agrupamento):
        r = _somar(dados, g["inicio"], g["fim"])
        itens.append({
            "chave": g["chave"], "rotulo": g["rotulo"], "inicio": g["inicio"], "fim": g["fim"],
            "pedidos_venda": r["vendas"]["pedidos"], "receita": r["vendas"]["receita"], "cmv": r["vendas"]["cmv"],
            "margem_bruta": r["vendas"]["margem_bruta"], "margem_percentual": r["vendas"]["margem_percentual"],
            "itens_sem_custo": r["vendas"]["itens_sem_custo"],
            "pedidos_compra": r["compras"]["pedidos"], "compras_total": r["compras"]["total"],
            "outras_receitas": r["outras_receitas"], "despesas": r["despesas"], "resultado": r["resultado"],
        })
    return {"periodo": {"inicio": inicio, "fim": fim}, "agrupamento": agrupamento, "itens": itens}


def _variacao(base: Decimal, novo: Decimal) -> Optional[Decimal]:
    """Quanto o período B variou em relação ao A, em %. Sem base (A = 0) não há percentual."""
    if not base:
        return None
    return ((novo - base) / abs(base) * 100).quantize(_CENTAVO, rounding=ROUND_HALF_UP)


def comparativo(db: Session, a: Tuple[date, date], b: Tuple[date, date]) -> dict:
    ra, rb = resumo(db, *a), resumo(db, *b)
    return {
        "a": ra, "b": rb,
        "variacao": {
            "receita": _variacao(ra["vendas"]["receita"], rb["vendas"]["receita"]),
            "cmv": _variacao(ra["vendas"]["cmv"], rb["vendas"]["cmv"]),
            "margem_bruta": _variacao(ra["vendas"]["margem_bruta"], rb["vendas"]["margem_bruta"]),
            "compras": _variacao(ra["compras"]["total"], rb["compras"]["total"]),
            "outras_receitas": _variacao(ra["outras_receitas"], rb["outras_receitas"]),
            "despesas": _variacao(ra["despesas"], rb["despesas"]),
            "resultado": _variacao(ra["resultado"], rb["resultado"]),
        },
    }
