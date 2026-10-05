from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


def _limpar_texto(valor):
    return valor.strip() if isinstance(valor, str) else valor


class CategoriaCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=80)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)


class CategoriaUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=80)
    ativo: Optional[bool] = None

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)


class CategoriaResponse(BaseModel):
    id: int
    nome: str
    ativo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}