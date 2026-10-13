from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from schemas.relatorios import ResumoResponse, SerieResponse, ComparativoResponse
from core.security import get_current_user
from core import relatorios
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
