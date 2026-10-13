from datetime import date
from typing import List, Optional

from schemas.relatorios import Dinheiro, PeriodoResponse
from pydantic import BaseModel


# ---------------------------------------------------------------- fluxo de caixa realizado

class CaixaBloco(BaseModel):
    baixas_entrada: int
    entradas_bruto: Dinheiro        # recebido dos clientes (baixas de títulos a receber)
    taxa_estimada: Dinheiro         # taxa da forma de pagamento sobre o que foi recebido
    entradas_liquido: Dinheiro      # bruto - taxa estimada
    baixas_saida: int
    saidas: Dinheiro                # pago aos fornecedores e despesas (baixas de títulos a pagar)
    saldo: Dinheiro                 # entradas líquidas - saídas


class CaixaItem(CaixaBloco):
    chave: str
    rotulo: str
    inicio: date
    fim: date
    saldo_acumulado: Dinheiro       # soma dos saldos desde o início do período consultado


class FluxoCaixaResponse(BaseModel):
    periodo: PeriodoResponse
    agrupamento: str
    itens: List[CaixaItem]
    totais: CaixaBloco


# ---------------------------------------------------------------- fluxo previsto

class PrevistoBloco(BaseModel):
    titulos_receber: int
    a_receber_bruto: Dinheiro       # saldo em aberto dos títulos a receber
    taxa_estimada: Dinheiro
    a_receber_liquido: Dinheiro
    titulos_pagar: int
    a_pagar: Dinheiro               # saldo em aberto dos títulos a pagar
    saldo: Dinheiro                 # a receber líquido - a pagar


class PrevistoItem(PrevistoBloco):
    chave: str
    rotulo: str
    inicio: date
    fim: date
    saldo_acumulado: Dinheiro       # soma dos saldos desde hoje (sem o que está em atraso)


class FluxoPrevistoResponse(BaseModel):
    periodo: PeriodoResponse
    agrupamento: str
    em_atraso: PrevistoBloco        # já venceu e continua em aberto
    itens: List[PrevistoItem]
    totais: PrevistoBloco           # só o período, sem o atraso
    saldo_geral: Dinheiro           # em atraso + período


# ---------------------------------------------------------------- vencidos (inadimplência)

class FaixaAtraso(BaseModel):
    faixa: str                      # 1-30 | 31-60 | 61-90 | mais de 90
    de_dias: int
    ate_dias: Optional[int]         # nulo na última faixa
    quantidade: int
    saldo: Dinheiro


class ParteVencida(BaseModel):
    parte_id: Optional[int]         # cliente (receber) ou fornecedor (pagar); nulo = avulso sem parte
    parte_nome: str
    quantidade: int
    saldo: Dinheiro
    maior_atraso_dias: int
    faixas: List[FaixaAtraso]


class VencidosLado(BaseModel):
    quantidade: int
    saldo: Dinheiro
    faixas: List[FaixaAtraso]
    partes: List[ParteVencida]      # do maior saldo para o menor


class VencidosResponse(BaseModel):
    data_referencia: date
    receber: Optional[VencidosLado]  # nulo quando o filtro `tipo` pede só o outro lado
    pagar: Optional[VencidosLado]
