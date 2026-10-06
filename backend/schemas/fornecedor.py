from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from core.validacoes import (
    cnpj_valido,
    limpar_texto,
    normalizar_cep,
    normalizar_ddd,
    normalizar_documento,
    normalizar_uf,
)


class _ValidacoesFornecedor(BaseModel):
    """Regras compartilhadas por criação e edição (o endereço do fornecedor continua nas colunas dele)."""

    @field_validator(
        "nome", "telefone", "logradouro", "numero", "complemento", "bairro", "cidade",
        mode="before", check_fields=False,
    )
    @classmethod
    def _limpar_textos(cls, v):
        return limpar_texto(v)

    @field_validator("cnpj", mode="before", check_fields=False)
    @classmethod
    def _normalizar_cnpj(cls, v):
        return normalizar_documento(v) if isinstance(v, str) else v

    @field_validator("cnpj", check_fields=False)
    @classmethod
    def _validar_cnpj(cls, v):
        if v is not None and not cnpj_valido(v):
            raise ValueError("CNPJ inválido: confira os caracteres e os dígitos verificadores.")
        return v

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

    @field_validator("email", check_fields=False)
    @classmethod
    def _limitar_email(cls, v):
        if v is not None and len(v) > 100:
            raise ValueError("E-mail muito longo (máximo de 100 caracteres).")
        return v


class FornecedorCreate(_ValidacoesFornecedor):
    nome: str = Field(min_length=1, max_length=100)
    cnpj: str
    telefone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = Field(default=None, max_length=150)
    numero: Optional[str] = Field(default=None, max_length=10)
    complemento: Optional[str] = Field(default=None, max_length=100)
    bairro: Optional[str] = Field(default=None, max_length=80)
    cidade: Optional[str] = Field(default=None, max_length=80)
    uf: Optional[str] = None
    ddd: Optional[str] = None


class FornecedorUpdate(_ValidacoesFornecedor):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=100)
    cnpj: Optional[str] = None
    telefone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = Field(default=None, max_length=150)
    numero: Optional[str] = Field(default=None, max_length=10)
    complemento: Optional[str] = Field(default=None, max_length=100)
    bairro: Optional[str] = Field(default=None, max_length=80)
    cidade: Optional[str] = Field(default=None, max_length=80)
    uf: Optional[str] = None
    ddd: Optional[str] = None
    ativo: Optional[bool] = None


class FornecedorResponse(BaseModel):
    id: int
    nome: str
    cnpj: str
    telefone: Optional[str]
    email: Optional[str]
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

    model_config = {"from_attributes": True}