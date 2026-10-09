from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeSaida


class ReceitaItemCreate(BaseModel):
    produto_id: int = Field(gt=0)          # o insumo consumido
    quantidade: Quantidade                 # quantidade por "rendimento" da receita


class ReceitaCreate(BaseModel):
    produto_id: int = Field(gt=0)          # o produto que será fabricado
    rendimento: Quantidade                 # quanto a receita produz (na unidade do produto)
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ReceitaItemCreate] = Field(min_length=1)

    @field_validator("itens")
    @classmethod
    def sem_insumo_repetido(cls, itens):
        ids = [i.produto_id for i in itens]
        if len(ids) != len(set(ids)):
            raise ValueError("Insumo repetido na receita: some as quantidades em uma única linha")
        return itens


class ReceitaUpdate(BaseModel):
    """PUT: substitui rendimento, observação e a lista inteira de insumos."""
    rendimento: Quantidade
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ReceitaItemCreate] = Field(min_length=1)

    @field_validator("itens")
    @classmethod
    def sem_insumo_repetido(cls, itens):
        ids = [i.produto_id for i in itens]
        if len(ids) != len(set(ids)):
            raise ValueError("Insumo repetido na receita: some as quantidades em uma única linha")
        return itens


class ReceitaItemResponse(BaseModel):
    id: int
    produto_id: int
    produto_nome: str
    unidade_sigla: Optional[str]
    quantidade: QuantidadeSaida
    preco_custo: float
    subtotal: float
    insumo_ativo: bool


class ReceitaResponse(BaseModel):
    id: int
    produto_id: int
    produto_nome: str
    unidade_sigla: Optional[str]
    rendimento: QuantidadeSaida
    observacao: Optional[str]
    ativo: bool
    itens: List[ReceitaItemResponse]
    custo_total_estimado: float
    custo_unitario_estimado: float
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


class SimulacaoItem(BaseModel):
    produto_id: int
    produto_nome: str
    unidade_sigla: Optional[str]
    necessario: QuantidadeSaida
    disponivel: QuantidadeSaida
    falta: QuantidadeSaida
    suficiente: bool
    insumo_ativo: bool


class SimulacaoResponse(BaseModel):
    receita_id: int
    produto_id: int
    produto_nome: str
    quantidade: QuantidadeSaida
    receita_ativa: bool
    pode_produzir: bool
    custo_estimado: float
    itens: List[SimulacaoItem]
