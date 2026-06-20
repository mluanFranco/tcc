from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ItemCotacaoCreate(BaseModel):
    produto_id: int
    preco_unitario: float
    quantidade_referencia: Optional[int] = 1
    observacao: Optional[str] = None

class CotacaoCreate(BaseModel):
    fornecedor_id: int
    status: Optional[str] = "rascunho"   # rascunho | enviada | recebida | aprovada
    observacao: Optional[str] = None
    itens: List[ItemCotacaoCreate]

class CotacaoUpdateStatus(BaseModel):
    status: str

class ItemCotacaoResponse(BaseModel):
    id: int
    produto_id: int
    preco_unitario: Optional[float]
    quantidade_referencia: int
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
    quantidade_referencia: int
    data_cotacao: datetime

    model_config = {"from_attributes": True}