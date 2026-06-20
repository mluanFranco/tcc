from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class HistoricoManutencaoCreate(BaseModel):
    geladeira_id: int
    data: Optional[datetime] = None
    tipo: str            # preventiva | corretiva
    descricao: Optional[str] = None
    custo: Optional[float] = 0.0

class HistoricoManutencaoResponse(BaseModel):
    id: int
    geladeira_id: int
    usuario_id: int
    data: datetime
    tipo: str
    descricao: Optional[str]
    custo: float

    model_config = {"from_attributes": True}