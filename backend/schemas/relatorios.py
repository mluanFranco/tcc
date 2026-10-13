from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, PlainSerializer

_como_numero = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")
Dinheiro = Annotated[Decimal, _como_numero]
Percentual = Annotated[Decimal, _como_numero]


class PeriodoResponse(BaseModel):
    inicio: date
    fim: date


class VendasResumo(BaseModel):
    pedidos: int
    receita: Dinheiro                       # soma dos itens (já com desconto) das vendas confirmadas no período
    cmv: Dinheiro                           # custo do que foi vendido (quantidade x custo congelado na confirmação)
    margem_bruta: Dinheiro                  # receita - cmv
    margem_percentual: Optional[Percentual]  # nulo quando não há receita
    itens_sem_custo: int                    # itens vendidos com custo zerado: a margem deles está superestimada


class ComprasResumo(BaseModel):
    pedidos: int
    total: Dinheiro                         # investimento em estoque: não entra no resultado


class CategoriaTotal(BaseModel):
    categoria_id: int
    categoria_nome: str
    tipo: str                               # pagar = despesa | receber = outra receita
    quantidade: int
    total: Dinheiro


class ResumoResponse(BaseModel):
    periodo: PeriodoResponse
    vendas: VendasResumo
    compras: ComprasResumo
    outras_receitas: Dinheiro
    despesas: Dinheiro
    por_categoria: List[CategoriaTotal]
    resultado: Dinheiro                     # margem bruta + outras receitas - despesas


class SerieItem(BaseModel):
    chave: str
    rotulo: str
    inicio: date
    fim: date
    pedidos_venda: int
    receita: Dinheiro
    cmv: Dinheiro
    margem_bruta: Dinheiro
    margem_percentual: Optional[Percentual]
    itens_sem_custo: int
    pedidos_compra: int
    compras_total: Dinheiro
    outras_receitas: Dinheiro
    despesas: Dinheiro
    resultado: Dinheiro


class SerieResponse(BaseModel):
    periodo: PeriodoResponse
    agrupamento: str
    itens: List[SerieItem]


class VariacaoResponse(BaseModel):
    """Variação percentual do período B em relação ao A. Nulo quando o valor de A é zero."""
    receita: Optional[Percentual]
    cmv: Optional[Percentual]
    margem_bruta: Optional[Percentual]
    compras: Optional[Percentual]
    outras_receitas: Optional[Percentual]
    despesas: Optional[Percentual]
    resultado: Optional[Percentual]


class ComparativoResponse(BaseModel):
    a: ResumoResponse
    b: ResumoResponse
    variacao: VariacaoResponse
