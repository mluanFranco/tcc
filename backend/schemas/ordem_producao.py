from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeSaida


class OrdemProducaoCreate(BaseModel):
    receita_id: int = Field(gt=0)
    quantidade: Quantidade                      # quanto produzir, na unidade do produto
    observacao: Optional[str] = Field(default=None, max_length=255)


class OrdemProducaoStatusUpdate(BaseModel):
    status: str   # aberta | confirmada | cancelada


class OrdemProducaoItemResponse(BaseModel):
    produto_id: int
    produto_nome: str
    unidade_sigla: Optional[str]
    quantidade: QuantidadeSaida
    custo_unitario: float
    subtotal: float


class OrdemProducaoResponse(BaseModel):
    id: int
    receita_id: int
    produto_id: int
    produto_nome: str
    unidade_sigla: Optional[str]
    quantidade: QuantidadeSaida
    status: str
    usuario_id: int
    observacao: Optional[str]
    itens_previa: bool          # True = ordem aberta: itens calculados pela receita atual (ainda não congelados)
    itens: List[OrdemProducaoItemResponse]
    custo_total: Optional[float]
    custo_unitario: Optional[float]
    confirmada_em: Optional[datetime]
    cancelada_em: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
