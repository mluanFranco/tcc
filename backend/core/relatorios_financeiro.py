"""
Relatórios do financeiro (regime de caixa): fluxo realizado, fluxo previsto e vencidos.

- Fluxo realizado: baixas NÃO estornadas, pela data do pagamento. Entradas = baixas de títulos a receber,
  saídas = baixas de títulos a pagar. A taxa estimada é calculada por baixa (valor x taxa do título, 2 casas),
  então a soma dos grupos fecha exatamente com os totais.
- Fluxo previsto: saldo em aberto (valor - valor_pago) dos títulos aberto/parcial, pelo vencimento, de hoje em diante.
  O que já venceu e segue em aberto fica separado em `em_atraso`.
- Vencidos: saldo em aberto dos títulos com vencimento anterior à data de referência, em faixas de atraso.
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.financeiro import STATUS_EM_ABERTO
from core.relatorios import MAX_DIAS_PERIODO, _dinheiro, grupos_do_periodo, resolver_periodo
from models import BaixaTitulo, Cliente, Fornecedor, TituloFinanceiro

_ZERO = Decimal("0")
DIAS_PREVISAO_PADRAO = 90


# ---------------------------------------------------------------- fluxo realizado

def _bloco_caixa(linhas) -> dict:
    ent = {"n": 0, "bruto": _ZERO, "taxa": _ZERO}
    sai = {"n": 0, "total": _ZERO}
    for l in linhas:
        if l["tipo"] == "receber":
            ent["n"] += l["n"]; ent["bruto"] += l["valor"]; ent["taxa"] += l["taxa"]
        else:
            sai["n"] += l["n"]; sai["total"] += l["valor"]
    bruto, taxa, saidas = _dinheiro(ent["bruto"]), _dinheiro(ent["taxa"]), _dinheiro(sai["total"])
    liquido = bruto - taxa
    return {
        "baixas_entrada": ent["n"], "entradas_bruto": bruto, "taxa_estimada": taxa, "entradas_liquido": liquido,
        "baixas_saida": sai["n"], "saidas": saidas, "saldo": liquido - saidas,
    }


def fluxo_caixa(db: Session, inicio: date, fim: date, agrupamento: str) -> dict:
    taxa_baixa = func.round(BaixaTitulo.valor * TituloFinanceiro.taxa_percentual / 100, 2)
    linhas = [
        {"dia": dia, "tipo": tipo, "n": int(n), "valor": Decimal(valor or 0), "taxa": Decimal(taxa or 0)}
        for dia, tipo, n, valor, taxa in (
            db.query(
                BaixaTitulo.data_pagamento, TituloFinanceiro.tipo,
                func.count(BaixaTitulo.id), func.sum(BaixaTitulo.valor), func.sum(taxa_baixa),
            )
            .join(TituloFinanceiro, TituloFinanceiro.id == BaixaTitulo.titulo_id)
            .filter(
                BaixaTitulo.estornada.is_(False),
                BaixaTitulo.data_pagamento >= inicio, BaixaTitulo.data_pagamento <= fim,
            )
            .group_by(BaixaTitulo.data_pagamento, TituloFinanceiro.tipo)
        )
    ]
    itens, acumulado = [], _ZERO
    for g in grupos_do_periodo(inicio, fim, agrupamento):
        bloco = _bloco_caixa([l for l in linhas if g["inicio"] <= l["dia"] <= g["fim"]])
        acumulado += bloco["saldo"]
        itens.append({"chave": g["chave"], "rotulo": g["rotulo"], "inicio": g["inicio"], "fim": g["fim"],
                      **bloco, "saldo_acumulado": acumulado})
    return {"periodo": {"inicio": inicio, "fim": fim}, "agrupamento": agrupamento,
            "itens": itens, "totais": _bloco_caixa(linhas)}


# ---------------------------------------------------------------- fluxo previsto

def resolver_periodo_previsto(data_fim: Optional[date], hoje: Optional[date] = None):
    hoje = hoje or date.today()
    fim = data_fim or hoje + timedelta(days=DIAS_PREVISAO_PADRAO)
    if fim < hoje:
        raise HTTPException(
            status_code=400,
            detail="O fluxo previsto olha para a frente: data_fim não pode ser anterior a hoje. "
                   "O que já venceu aparece em 'em_atraso'.",
        )
    return resolver_periodo(hoje, fim)


def _bloco_previsto(linhas) -> dict:
    rec = {"n": 0, "bruto": _ZERO, "taxa": _ZERO}
    pag = {"n": 0, "total": _ZERO}
    for l in linhas:
        if l["tipo"] == "receber":
            rec["n"] += l["n"]; rec["bruto"] += l["saldo"]; rec["taxa"] += l["taxa"]
        else:
            pag["n"] += l["n"]; pag["total"] += l["saldo"]
    bruto, taxa, a_pagar = _dinheiro(rec["bruto"]), _dinheiro(rec["taxa"]), _dinheiro(pag["total"])
    liquido = bruto - taxa
    return {
        "titulos_receber": rec["n"], "a_receber_bruto": bruto, "taxa_estimada": taxa, "a_receber_liquido": liquido,
        "titulos_pagar": pag["n"], "a_pagar": a_pagar, "saldo": liquido - a_pagar,
    }


def fluxo_previsto(db: Session, inicio: date, fim: date, agrupamento: str) -> dict:
    """`inicio` é sempre hoje (ver resolver_periodo_previsto)."""
    saldo = TituloFinanceiro.valor - TituloFinanceiro.valor_pago
    linhas = [
        {"dia": dia, "tipo": tipo, "n": int(n), "saldo": Decimal(s or 0), "taxa": Decimal(taxa or 0)}
        for dia, tipo, n, s, taxa in (
            db.query(
                TituloFinanceiro.vencimento, TituloFinanceiro.tipo, func.count(TituloFinanceiro.id),
                func.sum(saldo), func.sum(func.round(saldo * TituloFinanceiro.taxa_percentual / 100, 2)),
            )
            .filter(TituloFinanceiro.status.in_(STATUS_EM_ABERTO), TituloFinanceiro.vencimento <= fim)
            .group_by(TituloFinanceiro.vencimento, TituloFinanceiro.tipo)
        )
    ]
    atrasadas = [l for l in linhas if l["dia"] < inicio]
    no_periodo = [l for l in linhas if l["dia"] >= inicio]
    itens, acumulado = [], _ZERO
    for g in grupos_do_periodo(inicio, fim, agrupamento):
        bloco = _bloco_previsto([l for l in no_periodo if g["inicio"] <= l["dia"] <= g["fim"]])
        acumulado += bloco["saldo"]
        itens.append({"chave": g["chave"], "rotulo": g["rotulo"], "inicio": g["inicio"], "fim": g["fim"],
                      **bloco, "saldo_acumulado": acumulado})
    em_atraso, totais = _bloco_previsto(atrasadas), _bloco_previsto(no_periodo)
    return {
        "periodo": {"inicio": inicio, "fim": fim}, "agrupamento": agrupamento,
        "em_atraso": em_atraso, "itens": itens, "totais": totais,
        "saldo_geral": em_atraso["saldo"] + totais["saldo"],
    }


# ---------------------------------------------------------------- vencidos

_FAIXAS = (("1-30", 1, 30), ("31-60", 31, 60), ("61-90", 61, 90), ("mais de 90", 91, None))


def _faixas_vazias() -> List[dict]:
    return [{"faixa": n, "de_dias": de, "ate_dias": ate, "quantidade": 0, "saldo": _ZERO} for n, de, ate in _FAIXAS]


def _faixa_do_atraso(dias: int) -> int:
    for i, (_, de, ate) in enumerate(_FAIXAS):
        if dias >= de and (ate is None or dias <= ate):
            return i
    raise ValueError(dias)


def _fechar_faixas(faixas: List[dict]) -> List[dict]:
    return [{**f, "saldo": _dinheiro(f["saldo"])} for f in faixas]


def vencidos(db: Session, referencia: date, tipo: Optional[str]) -> dict:
    saldo = TituloFinanceiro.valor - TituloFinanceiro.valor_pago
    consulta = (
        db.query(
            TituloFinanceiro.tipo, TituloFinanceiro.cliente_id, Cliente.nome,
            TituloFinanceiro.fornecedor_id, Fornecedor.nome,
            TituloFinanceiro.vencimento, func.count(TituloFinanceiro.id), func.sum(saldo),
        )
        .outerjoin(Cliente, Cliente.id == TituloFinanceiro.cliente_id)
        .outerjoin(Fornecedor, Fornecedor.id == TituloFinanceiro.fornecedor_id)
        .filter(TituloFinanceiro.status.in_(STATUS_EM_ABERTO), TituloFinanceiro.vencimento < referencia)
    )
    if tipo:
        consulta = consulta.filter(TituloFinanceiro.tipo == tipo)
    consulta = consulta.group_by(
        TituloFinanceiro.tipo, TituloFinanceiro.cliente_id, Cliente.nome,
        TituloFinanceiro.fornecedor_id, Fornecedor.nome, TituloFinanceiro.vencimento,
    )

    lados: Dict[str, dict] = {
        t: {"quantidade": 0, "saldo": _ZERO, "faixas": _faixas_vazias(), "partes": {}}
        for t in ("receber", "pagar") if tipo in (None, t)
    }
    for t, cliente_id, cliente_nome, fornecedor_id, fornecedor_nome, vencimento, n, s in consulta:
        lado = lados[t]
        n, s = int(n), Decimal(s or 0)
        dias = (referencia - vencimento).days
        i = _faixa_do_atraso(dias)
        parte_id, nome = (cliente_id, cliente_nome) if t == "receber" else (fornecedor_id, fornecedor_nome)
        parte = lado["partes"].setdefault(parte_id, {
            "parte_id": parte_id, "parte_nome": nome or "Sem cliente/fornecedor (lançamento avulso)",
            "quantidade": 0, "saldo": _ZERO, "maior_atraso_dias": 0, "faixas": _faixas_vazias(),
        })
        for alvo in (lado, parte):
            alvo["quantidade"] += n
            alvo["saldo"] += s
            alvo["faixas"][i]["quantidade"] += n
            alvo["faixas"][i]["saldo"] += s
        parte["maior_atraso_dias"] = max(parte["maior_atraso_dias"], dias)

    resposta = {"data_referencia": referencia, "receber": None, "pagar": None}
    for t, lado in lados.items():
        partes = sorted(
            ({**p, "saldo": _dinheiro(p["saldo"]), "faixas": _fechar_faixas(p["faixas"])} for p in lado["partes"].values()),
            key=lambda p: (-p["saldo"], p["parte_nome"]),
        )
        resposta[t] = {
            "quantidade": lado["quantidade"], "saldo": _dinheiro(lado["saldo"]),
            "faixas": _fechar_faixas(lado["faixas"]), "partes": partes,
        }
    return resposta
