from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from core.validacoes import limpar_texto, normalizar_cep, normalizar_ddd, normalizar_uf


class _ValidacoesEndereco(BaseModel):
    """Limpeza e validação compartilhadas por criação e edição.

    Não tem campos próprios: as regras valem para os campos de mesmo nome das subclasses.
    """

    @field_validator("logradouro", "numero", "complemento", "bairro", "cidade", mode="before", check_fields=False)
    @classmethod
    def _limpar_textos(cls, v):
        return limpar_texto(v)

    @field_validator("cep", mode="before", check_fields=False)
    @classmethod
    def _validar_cep(cls, v):
        return normalizar_cep(v)

    @field_validator("uf", mode="before", check_fields=False)
    @classmethod
    def _validar_uf(cls, v):
        return normalizar_uf(v)

    @field_validator("ddd", mode="before", check_fields=False)
    @classmethod
    def _validar_ddd(cls, v):
        return normalizar_ddd(v)


class EnderecoDados(_ValidacoesEndereco):
    cep: str
    logradouro: str = Field(min_length=1, max_length=150)
    numero: str = Field(min_length=1, max_length=10)
    complemento: Optional[str] = Field(default=None, max_length=100)
    bairro: Optional[str] = Field(default=None, max_length=80)
    cidade: str = Field(min_length=1, max_length=80)
    uf: str
    ddd: Optional[str] = None


class EnderecoCreate(EnderecoDados):
    tipo: Literal["principal", "entrega"]


class EnderecoUpdate(_ValidacoesEndereco):
    tipo: Optional[Literal["principal", "entrega"]] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = Field(default=None, min_length=1, max_length=150)
    numero: Optional[str] = Field(default=None, min_length=1, max_length=10)
    complemento: Optional[str] = Field(default=None, max_length=100)
    bairro: Optional[str] = Field(default=None, max_length=80)
    cidade: Optional[str] = Field(default=None, min_length=1, max_length=80)
    uf: Optional[str] = None
    ddd: Optional[str] = None
    ativo: Optional[bool] = None


class EnderecoResponse(BaseModel):
    id: int
    cliente_id: int
    tipo: str
    cep: Optional[str]
    logradouro: Optional[str]
    numero: Optional[str]
    complemento: Optional[str]
    bairro: Optional[str]
    cidade: Optional[str]
    uf: Optional[str]
    ddd: Optional[str]
    ativo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}