from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, PlainSerializer

from schemas.relatorios import Dinheiro, Percentual, PeriodoResponse

_como_numero = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")
Quantidade3 = Annotated[Decimal, _como_numero]   # quantidades com até 3 casas (kg, litros...)
Dias = Annotated[Decimal, _como_numero]


# ---------------------------------------------------------------- compras

class CompraFornecedorItem(BaseModel):
    posicao: int
    fornecedor_id: int
    fornecedor_nome: str
    pedidos: int
    total: Dinheiro
    ticket_medio: Dinheiro                  # total / pedidos
    participacao_percentual: Optional[Percentual]   # parte do total comprado no período
    ultima_compra: date


class ComprasTotais(BaseModel):
    pedidos: int
    total: Dinheiro


class ComprasPorFornecedorResponse(BaseModel):
    periodo: PeriodoResponse
    limite: int
    fornecedores_no_periodo: int            # quantos fornecedores tiveram compra (antes do limite)
    totais: ComprasTotais                   # do período inteiro, não só dos exibidos
    itens: List[CompraFornecedorItem]


class CompraProdutoItem(BaseModel):
    posicao: int
    produto_id: int
    produto_nome: str
    unidade: str
    pedidos: int
    quantidade: Quantidade3                 # quantidade pedida (não é a recebida)
    total: Dinheiro
    preco_medio: Optional[Dinheiro]         # médio ponderado: total / quantidade
    preco_minimo: Dinheiro
    preco_maximo: Dinheiro
    ultimo_preco: Dinheiro                  # preço do pedido mais recente
    participacao_percentual: Optional[Percentual]


class ComprasPorProdutoResponse(BaseModel):
    periodo: PeriodoResponse
    limite: int
    ordenar_por: str
    produtos_no_periodo: int
    total: Dinheiro                         # soma dos itens comprados no período inteiro
    itens: List[CompraProdutoItem]


# ---------------------------------------------------------------- vendas

class VendaProdutoItem(BaseModel):
    posicao: int
    produto_id: int
    produto_nome: str
    unidade: str
    pedidos: int
    quantidade: Quantidade3
    receita: Dinheiro
    preco_medio: Optional[Dinheiro]         # receita / quantidade
    cmv: Dinheiro
    margem_bruta: Dinheiro
    margem_percentual: Optional[Percentual]
    itens_sem_custo: int                    # itens vendidos com custo zerado: a margem deles está superestimada
    participacao_percentual: Optional[Percentual]   # parte da receita do período


class VendasTotais(BaseModel):
    pedidos: int
    receita: Dinheiro
    cmv: Dinheiro
    margem_bruta: Dinheiro
    margem_percentual: Optional[Percentual]
    itens_sem_custo: int


class VendasPorProdutoResponse(BaseModel):
    periodo: PeriodoResponse
    limite: int
    ordenar_por: str
    produtos_no_periodo: int
    totais: VendasTotais
    itens: List[VendaProdutoItem]


class VendaClienteItem(BaseModel):
    posicao: int
    cliente_id: int
    cliente_nome: str
    pedidos: int
    receita: Dinheiro
    ticket_medio: Dinheiro
    cmv: Dinheiro
    margem_bruta: Dinheiro
    margem_percentual: Optional[Percentual]
    participacao_percentual: Optional[Percentual]
    ultima_compra: date


class VendasPorClienteResponse(BaseModel):
    periodo: PeriodoResponse
    limite: int
    clientes_no_periodo: int
    totais: VendasTotais
    itens: List[VendaClienteItem]


# ---------------------------------------------------------------- formas de pagamento

class FormaPagamentoItem(BaseModel):
    posicao: int
    forma_pagamento_id: Optional[int]       # nulo = pedidos antigos sem forma
    forma_pagamento: str
    pedidos: int
    total: Dinheiro
    participacao_percentual: Optional[Percentual]
    prazo_medio_dias: Optional[Dias]        # dias entre o pedido e cada vencimento, ponderado pelo valor da parcela
    taxa_estimada: Optional[Dinheiro]       # só em venda: taxa da forma sobre as parcelas


class FormaPagamentoTotais(BaseModel):
    pedidos: int
    total: Dinheiro
    prazo_medio_dias: Optional[Dias]
    taxa_estimada: Optional[Dinheiro]


class PorFormaPagamentoResponse(BaseModel):
    periodo: PeriodoResponse
    origem: str                             # venda | compra
    totais: FormaPagamentoTotais
    itens: List[FormaPagamentoItem]
