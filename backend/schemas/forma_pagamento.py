from pydantic import BaseModel
from typing import Optional

class FormaPagamentoCreate(BaseModel):
    descricao: str
    tipo: str                          # vista | parcelado | prazo
    prazo_dias: Optional[int] = 0
    taxa_percentual: Optional[float] = 0.0

class FormaPagamentoUpdate(BaseModel):
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    prazo_dias: Optional[int] = None
    taxa_percentual: Optional[float] = None
    ativo: Optional[bool] = None

class FormaPagamentoResponse(BaseModel):
    id: int
    descricao: str
    tipo: str
    prazo_dias: int
    taxa_percentual: float
    ativo: bool

    model_config = {"from_attributes": True}