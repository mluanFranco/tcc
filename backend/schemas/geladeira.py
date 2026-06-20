from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GeladeiraCreate(BaseModel):
    cliente_id: int
    tipo: str
    modelo: Optional[str] = None
    marca: Optional[str] = None
    numero_serie: Optional[str] = None
    data_alocacao: Optional[datetime] = None

class GeladeiraUpdate(BaseModel):
    cliente_id: Optional[int] = None
    tipo: Optional[str] = None
    modelo: Optional[str] = None
    marca: Optional[str] = None
    numero_serie: Optional[str] = None
    data_alocacao: Optional[datetime] = None
    status: Optional[str] = None   # em_campo | manutencao | desativada

class GeladeiraResponse(BaseModel):
    id: int
    cliente_id: int
    tipo: str
    modelo: Optional[str]
    marca: Optional[str]
    numero_serie: Optional[str]
    data_alocacao: Optional[datetime]
    status: str

    model_config = {"from_attributes": True}