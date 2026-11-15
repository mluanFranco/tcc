from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, PlainSerializer

from schemas.relatorios import Dinheiro, Percentual, PeriodoResponse

Quantidade = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]


class VendaDia(BaseModel):
    data: date
    receita: Dinheiro


class VendasPorDia(BaseModel):
    atual: List[VendaDia]           # todos os dias do período, inclusive os sem venda (receita 0)
    anterior: List[VendaDia]        # mesmo número de dias, logo antes do período


class ClientesAtendidos(BaseModel):
    atual: int
    anterior: int


class ReceitaCategoria(BaseModel):
    categoria: str
    receita: Dinheiro
    participacao_percentual: Optional[Percentual]


class SituacaoEstoque(BaseModel):
    sem_estoque: int                # disponível (atual - reservado) <= 0
    baixo: int                      # atual <= mínimo
    em_dia: int
    valor_custo: Dinheiro           # estoque atual x custo da unidade base


class ProducaoPeriodo(BaseModel):
    ordens: int                     # ordens confirmadas no período
    custo: Dinheiro


class SituacaoGeladeiras(BaseModel):
    em_campo: int
    manutencao: int
    desativada: int
    manutencoes: int                # registros de manutenção no período
    custo_manutencoes: Dinheiro
    corretivas: int


class CaixaGrupo(BaseModel):
    rotulo: str
    inicio: date
    fim: date
    entradas: Dinheiro              # recebido (bruto) — baixas de títulos a receber
    saidas: Dinheiro                # pago — baixas de títulos a pagar


class CaixaPainel(BaseModel):
    agrupamento: str                # semana (12 semanas até o fim do período) | mes (períodos longos)
    itens: List[CaixaGrupo]


class RecebidoEmDia(BaseModel):
    total: int                      # títulos a receber vencidos no período (ou já pagos)
    em_dia: int                     # pagos até o vencimento
    percentual: Optional[Percentual]


class ItemProducao(BaseModel):
    produto: str
    unidade: str                    # sigla da unidade base
    ordens: int
    quantidade: Quantidade
    custo: Dinheiro


class ProducaoDetalhe(BaseModel):
    anterior_ordens: int            # ordens confirmadas no período de comparação
    anterior_custo: Dinheiro
    abertas: int                    # ordens abertas agora (aguardando confirmação)
    mais_produzidos: List[ItemProducao]          # top 5 por custo produzido
    insumos_mais_consumidos: List[ItemProducao]  # top 5 por custo consumido


class FaltaInsumo(BaseModel):
    insumo: str
    unidade: str
    necessario: Quantidade          # para 1 rendimento da receita
    disponivel: Quantidade


class ReceitaTravada(BaseModel):
    produto: str
    faltas: List[FaltaInsumo]


class SituacaoReceitas(BaseModel):
    ativas: int
    prontas: int                    # todo insumo disponível para 1 rendimento
    travadas: List[ReceitaTravada]
    sem_receita: int                # vendáveis (não insumo) sem receita ativa e nunca comprados (fora a revenda)
    sem_receita_nomes: List[str]    # até 5


class PainelResponse(BaseModel):
    periodo: PeriodoResponse
    periodo_anterior: PeriodoResponse
    vendas_por_dia: VendasPorDia
    clientes: ClientesAtendidos
    por_categoria: List[ReceitaCategoria]
    estoque: SituacaoEstoque
    producao: ProducaoPeriodo
    producao_detalhe: Optional[ProducaoDetalhe] = None   # nulo sem producao.ver
    receitas: Optional[SituacaoReceitas] = None          # nulo sem producao.ver
    geladeiras: Optional[SituacaoGeladeiras]        # nulo sem geladeiras.ver
    caixa: Optional[CaixaPainel]                    # nulo sem financeiro.ver
    recebido_em_dia: Optional[RecebidoEmDia]        # nulo sem financeiro.ver
