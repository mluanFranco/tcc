"""
Painel do Dashboard: os números que os outros relatórios não trazem, numa chamada só.

- Vendas por dia do período e do período anterior, para a linha acumulada. O anterior vem da tela (ex.: mesmos dias do
  mês passado); sem ele, vale o mesmo número de dias logo antes do período.
- Clientes atendidos (distintos) nos dois períodos.
- Receita por categoria do produto no período.
- Estoque dos produtos ativos: sem estoque (disponível <= 0), baixo (atual <= mínimo) e em dia; valor a custo.
- Produção: ordens confirmadas no período e o custo delas.
- Produção em detalhe e receitas (só com producao.ver): custo produzido no período e no anterior, ordens abertas,
  o que mais foi produzido e os insumos mais consumidos (por custo); receitas prontas para produzir (insumo disponível
  para 1 rendimento) x travadas por falta de insumo, e produtos vendáveis sem receita (fora os de revenda: quem já
  foi comprado de fornecedor não precisa de receita).
- Geladeiras (só com geladeiras.ver): quantidade por situação e manutenções do período.
- Financeiro (só com financeiro.ver): caixa realizado por semana (ou por mês em períodos longos)
  e recebimento em dia (títulos a receber que venceram no período e foram pagos até o vencimento).

Mesmas regras dos outros relatórios: venda conta quando CONFIRMADA; receita = subtotal dos itens.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import Numeric, case, cast, func
from sqlalchemy.orm import Session, joinedload

from core.relatorios import _dinheiro, _percentual, grupos_do_periodo
from core.relatorios_financeiro import _bloco_caixa
from models import (
    BaixaTitulo, Categoria, Geladeira, HistoricoManutencao, ItemPedidoCompra, ItemPedidoVenda, OrdemProducao,
    OrdemProducaoItem, PedidoCompra, PedidoVenda, Produto, Receita, ReceitaItem, TituloFinanceiro, UnidadeMedida,
)
TOP = 5

_ZERO = Decimal("0")
SEMANAS_CAIXA = 12           # em períodos de até MAX_DIAS_SEMANAL dias, o caixa mostra as 12 semanas até o fim do período
MAX_DIAS_SEMANAL = 92


def periodo_anterior(inicio: date, fim: date):
    """Mesmo número de dias, terminando na véspera do início."""
    dias = (fim - inicio).days
    fim_a = inicio - timedelta(days=1)
    return fim_a - timedelta(days=dias), fim_a


def _filtro_vendas(inicio: date, fim: date):
    ini = datetime.combine(inicio, time.min)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min)
    return [PedidoVenda.status == "confirmado", PedidoVenda.confirmado_em >= ini, PedidoVenda.confirmado_em < fim_dt]


def _vendas_por_dia(db: Session, inicio: date, fim: date) -> list:
    dia = func.date(PedidoVenda.confirmado_em)
    por_dia = dict(
        db.query(dia, func.sum(cast(ItemPedidoVenda.subtotal, Numeric(14, 2))))
        .join(ItemPedidoVenda, ItemPedidoVenda.pedido_venda_id == PedidoVenda.id)
        .filter(*_filtro_vendas(inicio, fim))
        .group_by(dia)
    )
    return [{"data": inicio + timedelta(days=i), "receita": _dinheiro(por_dia.get(inicio + timedelta(days=i)))}
            for i in range((fim - inicio).days + 1)]


def _clientes(db: Session, inicio: date, fim: date) -> int:
    return int(db.query(func.count(func.distinct(PedidoVenda.cliente_id))).filter(*_filtro_vendas(inicio, fim)).scalar() or 0)


def _por_categoria(db: Session, inicio: date, fim: date) -> list:
    linhas = (
        db.query(Categoria.nome, func.sum(cast(ItemPedidoVenda.subtotal, Numeric(14, 2))))
        .select_from(ItemPedidoVenda)
        .join(PedidoVenda, PedidoVenda.id == ItemPedidoVenda.pedido_venda_id)
        .join(Produto, Produto.id == ItemPedidoVenda.produto_id)
        .join(Categoria, Categoria.id == Produto.categoria_id)
        .filter(*_filtro_vendas(inicio, fim))
        .group_by(Categoria.nome)
        .all()
    )
    total = sum((Decimal(r or 0) for _, r in linhas), _ZERO)
    itens = [{"categoria": nome, "receita": _dinheiro(r), "participacao_percentual": _percentual(Decimal(r or 0), total)}
             for nome, r in linhas]
    return sorted(itens, key=lambda c: (-c["receita"], c["categoria"]))


def _estoque(db: Session) -> dict:
    sem = baixo = em_dia = 0
    valor = _ZERO
    for p in db.query(Produto).filter(Produto.ativo.is_(True)):
        atual = Decimal(p.estoque_atual or 0)
        disponivel = atual - Decimal(p.estoque_reservado or 0)
        if disponivel <= 0:
            sem += 1
        elif atual <= Decimal(p.estoque_minimo or 0):
            baixo += 1
        else:
            em_dia += 1
        if atual > 0:
            valor += atual * Decimal(str(p.custo_unidade_base))   # estoque fica na unidade base
    return {"sem_estoque": sem, "baixo": baixo, "em_dia": em_dia, "valor_custo": _dinheiro(valor)}


def _producao(db: Session, inicio: date, fim: date) -> dict:
    ini = datetime.combine(inicio, time.min)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min)
    n, custo = (
        db.query(func.count(OrdemProducao.id), func.sum(OrdemProducao.custo_total))
        .filter(OrdemProducao.status == "confirmada", OrdemProducao.confirmada_em >= ini, OrdemProducao.confirmada_em < fim_dt)
        .one()
    )
    return {"ordens": int(n or 0), "custo": _dinheiro(custo)}


def _janela(inicio: date, fim: date):
    return datetime.combine(inicio, time.min), datetime.combine(fim + timedelta(days=1), time.min)


def _producao_detalhe(db: Session, inicio: date, fim: date, ini_a: date, fim_a: date) -> dict:
    """Ordens confirmadas no período (e no anterior), ordens abertas agora, o que mais foi produzido e os insumos
    mais consumidos. Os rankings são por CUSTO: os produtos têm unidades diferentes (L, kg, un)."""
    ini, fim_dt = _janela(inicio, fim)
    confirmada_no = lambda a, b: [OrdemProducao.status == "confirmada", OrdemProducao.confirmada_em >= a,  # noqa: E731
                                  OrdemProducao.confirmada_em < b]
    anterior = _producao(db, ini_a, fim_a)
    abertas = int(db.query(func.count(OrdemProducao.id)).filter(OrdemProducao.status == "aberta").scalar() or 0)

    produzidos = [
        {"produto": nome, "unidade": sigla, "ordens": int(n), "quantidade": Decimal(q or 0), "custo": _dinheiro(c)}
        for nome, sigla, n, q, c in (
            db.query(Produto.nome, UnidadeMedida.sigla, func.count(OrdemProducao.id), func.sum(OrdemProducao.quantidade),
                     func.sum(OrdemProducao.custo_total))
            .join(Produto, Produto.id == OrdemProducao.produto_id)
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_medida_id)
            .filter(*confirmada_no(ini, fim_dt))
            .group_by(Produto.nome, UnidadeMedida.sigla)
        )
    ]
    insumos = [
        {"produto": nome, "unidade": sigla, "ordens": int(n), "quantidade": Decimal(q or 0), "custo": _dinheiro(c)}
        for nome, sigla, n, q, c in (
            db.query(Produto.nome, UnidadeMedida.sigla, func.count(func.distinct(OrdemProducao.id)),
                     func.sum(OrdemProducaoItem.quantidade), func.sum(OrdemProducaoItem.subtotal))
            .select_from(OrdemProducaoItem)
            .join(OrdemProducao, OrdemProducao.id == OrdemProducaoItem.ordem_id)
            .join(Produto, Produto.id == OrdemProducaoItem.produto_id)
            .join(UnidadeMedida, UnidadeMedida.id == Produto.unidade_medida_id)
            .filter(*confirmada_no(ini, fim_dt))
            .group_by(Produto.nome, UnidadeMedida.sigla)
        )
    ]
    ordenar = lambda lista: sorted(lista, key=lambda x: (-x["custo"], x["produto"]))[:TOP]  # noqa: E731
    return {"anterior_ordens": anterior["ordens"], "anterior_custo": anterior["custo"], "abertas": abertas,
            "mais_produzidos": ordenar(produzidos), "insumos_mais_consumidos": ordenar(insumos)}


def _receitas(db: Session) -> dict:
    """Receitas ativas prontas para produzir (todo insumo com disponível >= quantidade de 1 rendimento) ou travadas,
    e produtos vendáveis (não insumo) sem receita ativa que nunca foram comprados de fornecedor (os comprados são
    revenda, como casquinhas, e não precisam de receita)."""
    receitas = (db.query(Receita)
                .options(joinedload(Receita.produto),
                         joinedload(Receita.itens).joinedload(ReceitaItem.produto).joinedload(Produto.unidade_medida))
                .filter(Receita.ativo.is_(True)).all())
    travadas = []
    for r in receitas:
        faltas = []
        for item in r.itens:
            insumo = item.produto
            disponivel = Decimal(insumo.estoque_atual or 0) - Decimal(insumo.estoque_reservado or 0)
            if disponivel < Decimal(item.quantidade):
                faltas.append({"insumo": insumo.nome, "unidade": insumo.unidade_medida.sigla if insumo.unidade_medida else "",
                               "necessario": Decimal(item.quantidade), "disponivel": max(disponivel, _ZERO)})
        if faltas:
            travadas.append({"produto": r.produto.nome, "faltas": faltas})
    travadas.sort(key=lambda t: t["produto"])
    sem_receita = [
        nome for (nome,) in db.query(Produto.nome)
        .filter(Produto.ativo.is_(True), Produto.e_vendavel.is_(True), Produto.e_insumo.is_(False),
                ~Produto.id.in_(db.query(Receita.produto_id).filter(Receita.ativo.is_(True))),
                ~Produto.id.in_(db.query(ItemPedidoCompra.produto_id).join(PedidoCompra, PedidoCompra.id == ItemPedidoCompra.pedido_compra_id)
                                .filter(PedidoCompra.status != "cancelado")))
        .order_by(Produto.nome)
    ]
    return {"ativas": len(receitas), "prontas": len(receitas) - len(travadas), "travadas": travadas,
            "sem_receita": len(sem_receita), "sem_receita_nomes": sem_receita[:TOP]}


def _geladeiras(db: Session, inicio: date, fim: date) -> dict:
    por_status = dict(db.query(Geladeira.status, func.count(Geladeira.id)).group_by(Geladeira.status))
    ini = datetime.combine(inicio, time.min)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min)
    n, custo, corretivas = (
        db.query(func.count(HistoricoManutencao.id), func.sum(HistoricoManutencao.custo),
                 func.sum(case((HistoricoManutencao.tipo == "corretiva", 1), else_=0)))
        .filter(HistoricoManutencao.data >= ini, HistoricoManutencao.data < fim_dt)
        .one()
    )
    return {
        "em_campo": int(por_status.get("em_campo", 0)), "manutencao": int(por_status.get("manutencao", 0)),
        "desativada": int(por_status.get("desativada", 0)),
        "manutencoes": int(n or 0), "custo_manutencoes": _dinheiro(custo), "corretivas": int(corretivas or 0),
    }


def _caixa(db: Session, inicio: date, fim: date) -> dict:
    """Semanas (segunda a domingo) quando o período é curto; meses quando é longo."""
    if (fim - inicio).days + 1 <= MAX_DIAS_SEMANAL:
        agrupamento = "semana"
        primeira = fim - timedelta(days=fim.weekday()) - timedelta(weeks=SEMANAS_CAIXA - 1)
        grupos = [{"inicio": primeira + timedelta(weeks=i), "fim": min(primeira + timedelta(weeks=i, days=6), fim)}
                  for i in range(SEMANAS_CAIXA)]
        for g in grupos:
            g["rotulo"] = g["inicio"].strftime("%d/%m")
    else:
        agrupamento = "mes"
        grupos = [{"inicio": g["inicio"], "fim": g["fim"], "rotulo": g["rotulo"]} for g in grupos_do_periodo(inicio, fim, "mes")]
    de, ate = grupos[0]["inicio"], grupos[-1]["fim"]
    taxa = func.round(BaixaTitulo.valor * TituloFinanceiro.taxa_percentual / 100, 2)
    linhas = [
        {"dia": dia, "tipo": tipo, "n": int(n), "valor": Decimal(v or 0), "taxa": Decimal(t or 0)}
        for dia, tipo, n, v, t in (
            db.query(BaixaTitulo.data_pagamento, TituloFinanceiro.tipo, func.count(BaixaTitulo.id),
                     func.sum(BaixaTitulo.valor), func.sum(taxa))
            .join(TituloFinanceiro, TituloFinanceiro.id == BaixaTitulo.titulo_id)
            .filter(BaixaTitulo.estornada.is_(False), BaixaTitulo.data_pagamento >= de, BaixaTitulo.data_pagamento <= ate)
            .group_by(BaixaTitulo.data_pagamento, TituloFinanceiro.tipo)
        )
    ]
    itens = []
    for g in grupos:
        bloco = _bloco_caixa([l for l in linhas if g["inicio"] <= l["dia"] <= g["fim"]])
        itens.append({**g, "entradas": bloco["entradas_bruto"], "saidas": bloco["saidas"]})
    return {"agrupamento": agrupamento, "itens": itens}


def _recebido_em_dia(db: Session, inicio: date, fim: date, hoje: date) -> dict:
    """Títulos a receber que venceram no período (até ontem) ou já foram pagos: quantos foram pagos até o vencimento."""
    ultima = (
        db.query(BaixaTitulo.titulo_id, func.max(BaixaTitulo.data_pagamento).label("ultima"))
        .filter(BaixaTitulo.estornada.is_(False)).group_by(BaixaTitulo.titulo_id).subquery()
    )
    titulos = (
        db.query(TituloFinanceiro.status, TituloFinanceiro.vencimento, ultima.c.ultima)
        .outerjoin(ultima, ultima.c.titulo_id == TituloFinanceiro.id)
        .filter(TituloFinanceiro.tipo == "receber", TituloFinanceiro.status != "cancelado",
                TituloFinanceiro.vencimento >= inicio, TituloFinanceiro.vencimento <= fim)
        .all()
    )
    considerados = [t for t in titulos if t.status == "pago" or t.vencimento < hoje]
    em_dia = sum(1 for t in considerados if t.status == "pago" and t.ultima and t.ultima <= t.vencimento)
    total = len(considerados)
    return {"total": total, "em_dia": em_dia, "percentual": _percentual(Decimal(em_dia), Decimal(total))}


def painel(db: Session, inicio: date, fim: date, *, ver_financeiro: bool, ver_geladeiras: bool,
           ver_producao: bool = False, anterior: Optional[tuple] = None, hoje: Optional[date] = None) -> dict:
    hoje = hoje or date.today()
    ini_a, fim_a = anterior or periodo_anterior(inicio, fim)
    return {
        "periodo": {"inicio": inicio, "fim": fim},
        "periodo_anterior": {"inicio": ini_a, "fim": fim_a},
        "vendas_por_dia": {"atual": _vendas_por_dia(db, inicio, fim), "anterior": _vendas_por_dia(db, ini_a, fim_a)},
        "clientes": {"atual": _clientes(db, inicio, fim), "anterior": _clientes(db, ini_a, fim_a)},
        "por_categoria": _por_categoria(db, inicio, fim),
        "estoque": _estoque(db),
        "producao": _producao(db, inicio, fim),
        "producao_detalhe": _producao_detalhe(db, inicio, fim, ini_a, fim_a) if ver_producao else None,
        "receitas": _receitas(db) if ver_producao else None,
        "geladeiras": _geladeiras(db, inicio, fim) if ver_geladeiras else None,
        "caixa": _caixa(db, inicio, fim) if ver_financeiro else None,
        "recebido_em_dia": _recebido_em_dia(db, inicio, fim, hoje) if ver_financeiro else None,
    }
