from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from schemas.endereco import EnderecoResponse


def _texto_ou_nulo(v):
    """Tira espaços das pontas; texto vazio vira nulo (evita dois números de série "" colidindo na UNIQUE)."""
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class _LimpezaGeladeira(BaseModel):
    @field_validator("modelo", "marca", "numero_serie", mode="before", check_fields=False)
    @classmethod
    def _limpar_opcionais(cls, v):
        return _texto_ou_nulo(v)

    @field_validator("tipo", mode="before", check_fields=False)
    @classmethod
    def _limpar_tipo(cls, v):
        return v.strip() if isinstance(v, str) else v


class GeladeiraCreate(_LimpezaGeladeira):
    cliente_id: int = Field(gt=0)
    endereco_id: int = Field(gt=0)      # um dos endereços do cliente
    tipo: str = Field(min_length=1, max_length=50)
    modelo: Optional[str] = Field(default=None, max_length=100)
    marca: Optional[str] = Field(default=None, max_length=50)
    numero_serie: Optional[str] = Field(default=None, max_length=100)
    data_alocacao: Optional[datetime] = None


class GeladeiraUpdate(_LimpezaGeladeira):
    """Atualização parcial: só o que for enviado muda. modelo, marca, numero_serie e data_alocacao aceitam null para apagar."""
    cliente_id: Optional[int] = Field(default=None, gt=0)
    endereco_id: Optional[int] = Field(default=None, gt=0)
    tipo: Optional[str] = Field(default=None, min_length=1, max_length=50)
    modelo: Optional[str] = Field(default=None, max_length=100)
    marca: Optional[str] = Field(default=None, max_length=50)
    numero_serie: Optional[str] = Field(default=None, max_length=100)
    data_alocacao: Optional[datetime] = None
    status: Optional[Literal["em_campo", "manutencao", "desativada"]] = None


class GeladeiraResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nome: Optional[str] = None
    endereco_id: Optional[int]          # vazio apenas em geladeiras antigas sem endereço
    endereco: Optional[EnderecoResponse] = None
    tipo: str
    modelo: Optional[str]
    marca: Optional[str]
    numero_serie: Optional[str]
    data_alocacao: Optional[datetime]
    status: str

    model_config = {"from_attributes": True}
