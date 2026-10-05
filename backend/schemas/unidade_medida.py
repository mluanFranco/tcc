from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


def _limpar_texto(valor):
    return valor.strip() if isinstance(valor, str) else valor


class UnidadeMedidaCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=50)
    sigla: str = Field(min_length=1, max_length=10)

    @field_validator("nome", "sigla", mode="before")
    @classmethod
    def limpar_textos(cls, v):
        return _limpar_texto(v)


class UnidadeMedidaUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=50)
    sigla: Optional[str] = Field(default=None, min_length=1, max_length=10)
    ativo: Optional[bool] = None

    @field_validator("nome", "sigla", mode="before")
    @classmethod
    def limpar_textos(cls, v):
        return _limpar_texto(v)


class UnidadeMedidaResponse(BaseModel):
    id: int
    nome: str
    sigla: str
    ativo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}