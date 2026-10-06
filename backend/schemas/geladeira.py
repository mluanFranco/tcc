from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from schemas.endereco import EnderecoResponse


class GeladeiraCreate(BaseModel):
    cliente_id: int = Field(gt=0)
    endereco_id: int = Field(gt=0)      # um dos endereços do cliente
    tipo: str
    modelo: Optional[str] = None
    marca: Optional[str] = None
    numero_serie: Optional[str] = None
    data_alocacao: Optional[datetime] = None


class GeladeiraUpdate(BaseModel):
    cliente_id: Optional[int] = Field(default=None, gt=0)
    endereco_id: Optional[int] = Field(default=None, gt=0)
    tipo: Optional[str] = None
    modelo: Optional[str] = None
    marca: Optional[str] = None
    numero_serie: Optional[str] = None
    data_alocacao: Optional[datetime] = None
    status: Optional[str] = None   # em_campo | manutencao | desativada


class GeladeiraResponse(BaseModel):
    id: int
    cliente_id: int
    endereco_id: Optional[int]          # vazio apenas em geladeiras antigas sem endereço
    endereco: Optional[EnderecoResponse] = None
    tipo: str
    modelo: Optional[str]
    marca: Optional[str]
    numero_serie: Optional[str]
    data_alocacao: Optional[datetime]
    status: str

    model_config = {"from_attributes": True}