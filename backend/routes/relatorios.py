from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from schemas.relatorios import ResumoResponse, SerieResponse, ComparativoResponse
from schemas.relatorios_financeiro import FluxoCaixaResponse, FluxoPrevistoResponse, VencidosResponse
from core.security import get_current_user
from core import relatorios, relatorios_financeiro
from typing import Optional
from datetime import date

router = APIRouter(prefix="/financeiro/relatorios", tags=["Financeiro - Relatórios"])

_DESC_INICIO = "Primeiro dia do período (inclusivo). Sem datas: 1º de janeiro do ano corrente até hoje."
_DESC_FIM = "Último dia do período (inclusivo). Padrão: hoje."


@router.get("/resumo", response_model=ResumoResponse)
def resumo_do_periodo(
    data_inicio: Optional[date] = Query(default=None, description=_DESC_INICIO),
    data_fim: Optional[date] = Query(default=None, description=_DESC_FIM),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Resumo por competência: receita, custo do vendido (CMV), margem bruta, compras (investimento em estoque),
    despesas e outras receitas por categoria, e resultado. A compra de insumos não entra no resultado: ela
    vira custo quando o produto é vendido.
    """
    inicio, fim = relatorios.resolver_periodo(data_inicio, data_fim)
    return relatorios.resumo(db, inicio, fim)


@router.get("/serie", response_model=SerieResponse)
def serie_por_periodo(
    data_inicio: Optional[date] = Query(default=None, description=_DESC_INICIO),
    data_fim: Optional[date] = Query(default=None, description=_DESC_FIM),
    agrupamento: str = Query(default="mes", pattern="^(mes|trimestre|estacao|ano)$",
                             description="Estações por meses fechados do hemisfério sul: verão dez-fev, outono mar-mai, inverno jun-ago, primavera set-nov."),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Os mesmos números do resumo, quebrados em mês, trimestre, estação do ano ou ano (inclui grupos sem movimento)."""
    inicio, fim = relatorios.resolver_periodo(data_inicio, data_fim)
    return relatorios.serie(db, inicio, fim, agrupamento)


@router.get("/comparativo", response_model=ComparativoResponse)
def comparar_periodos(
    inicio_a: date = Query(description="Início do período A (base de comparação)"),
    fim_a: date = Query(description="Fim do período A"),
    inicio_b: date = Query(description="Início do período B (o que está sendo comparado)"),
    fim_b: date = Query(description="Fim do período B"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Resumo dos dois períodos e a variação de B em relação a A, em %. Exemplo: A = verão, B = inverno."""
    a = relatorios.resolver_periodo(inicio_a, fim_a)
    b = relatorios.resolver_periodo(inicio_b, fim_b)
    return relatorios.comparativo(db, a, b)


_AGRUPAMENTO = Query(
    default="mes", pattern="^(mes|trimestre|estacao|ano)$",
    description="Estações por meses fechados do hemisfério sul: verão dez-fev, outono mar-mai, inverno jun-ago, primavera set-nov.",
)


@router.get("/fluxo-caixa", response_model=FluxoCaixaResponse)
def fluxo_de_caixa(
    data_inicio: Optional[date] = Query(default=None, description=_DESC_INICIO),
    data_fim: Optional[date] = Query(default=None, description=_DESC_FIM),
    agrupamento: str = _AGRUPAMENTO,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Fluxo de caixa REALIZADO (regime de caixa): o que de fato entrou e saiu, pela data do pagamento das baixas
    (estornadas não contam). Entradas mostram o bruto, a taxa estimada da forma de pagamento e o líquido.
    O saldo acumulado parte do início do período consultado (o sistema não tem saldo bancário inicial).
    """
    inicio, fim = relatorios.resolver_periodo(data_inicio, data_fim)
    return relatorios_financeiro.fluxo_caixa(db, inicio, fim, agrupamento)


@router.get("/fluxo-previsto", response_model=FluxoPrevistoResponse)
def fluxo_previsto(
    data_fim: Optional[date] = Query(default=None, description="Último dia da previsão (inclusivo). Padrão: hoje + 90 dias. Não pode ser anterior a hoje."),
    agrupamento: str = _AGRUPAMENTO,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Fluxo PREVISTO: saldo em aberto dos títulos (a receber e a pagar) pelo vencimento, de hoje até `data_fim`.
    O que já venceu e continua em aberto aparece à parte, em `em_atraso`.
    """
    inicio, fim = relatorios_financeiro.resolver_periodo_previsto(data_fim)
    return relatorios_financeiro.fluxo_previsto(db, inicio, fim, agrupamento)


@router.get("/vencidos", response_model=VencidosResponse)
def titulos_vencidos(
    tipo: Optional[str] = Query(default=None, pattern="^(pagar|receber)$", description="Só um lado: receber (inadimplência de clientes) ou pagar (contas atrasadas)."),
    data_referencia: Optional[date] = Query(default=None, description="Dia a partir do qual o atraso é contado. Padrão: hoje. Informar outra data simula a situação ATUAL dos títulos nessa data."),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Inadimplência: saldo em aberto dos títulos vencidos em faixas de atraso (1-30, 31-60, 61-90 e mais de 90 dias),
    separado em a receber e a pagar, com o detalhe por cliente ou fornecedor (maior saldo primeiro).
    """
    return relatorios_financeiro.vencidos(db, data_referencia or date.today(), tipo)
