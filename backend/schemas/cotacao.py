from decimal import Decimal
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeSaida

class ItemCotacaoCreate(BaseModel):
    produto_id: int = Field(gt=0)
    preco_unitario: float = Field(ge=0)
    quantidade_referencia: Quantidade = Decimal("1")
    observacao: Optional[str] = Field(default=None, max_length=255)

class CotacaoCreate(BaseModel):
    fornecedor_id: int = Field(gt=0)
    status: Literal["rascunho", "enviada", "recebida", "aprovada"] = "rascunho"
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ItemCotacaoCreate]

class CotacaoUpdateStatus(BaseModel):
    status: str

class ItemCotacaoResponse(BaseModel):
    id: int
    produto_id: int
    preco_unitario: Optional[float]
    quantidade_referencia: QuantidadeSaida
    observacao: Optional[str]

    model_config = {"from_attributes": True}

class CotacaoResponse(BaseModel):
    id: int
    fornecedor_id: int
    usuario_id: int
    data_cotacao: datetime
    status: str
    observacao: Optional[str]
    itens: List[ItemCotacaoResponse]

    model_config = {"from_attributes": True}

class ComparativoFornecedor(BaseModel):
    fornecedor_id: int
    fornecedor_nome: str
    cotacao_id: int
    preco_unitario: float
    quantidade_referencia: QuantidadeSaida
    data_cotacao: datetime

    model_config = {"from_attributes": True}
