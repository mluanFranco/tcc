from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from core.validacoes import limpar_texto, normalizar_documento, tipo_do_documento
from schemas.endereco import EnderecoDados, EnderecoResponse


def _normalizar_documento(v):
    return normalizar_documento(v) if isinstance(v, str) else v


def _exigir_documento_valido(v):
    if v is not None and tipo_do_documento(v) is None:
        raise ValueError("CPF/CNPJ inválido: confira os números e os dígitos verificadores.")
    return v


def _limitar_email(v):
    if v is not None and len(v) > 100:
        raise ValueError("E-mail muito longo (máximo de 100 caracteres).")
    return v


class ClienteCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    cpf_cnpj: str
    tipo: Optional[Literal["PF", "PJ"]] = None   # se vier, precisa bater com o documento
    telefone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    endereco_principal: EnderecoDados

    @field_validator("nome", "telefone", mode="before")
    @classmethod
    def _limpar(cls, v):
        return limpar_texto(v)

    @field_validator("cpf_cnpj", mode="before")
    @classmethod
    def _normalizar(cls, v):
        return _normalizar_documento(v)

    @field_validator("cpf_cnpj")
    @classmethod
    def _validar_documento(cls, v):
        return _exigir_documento_valido(v)

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v):
        return _limitar_email(v)

    @model_validator(mode="after")
    def _definir_tipo(self):
        tipo_documento = tipo_do_documento(self.cpf_cnpj)
        if self.tipo and self.tipo != tipo_documento:
            raise ValueError(
                f"O tipo informado ({self.tipo}) não corresponde ao documento informado ({tipo_documento})."
            )
        self.tipo = tipo_documento
        return self


class ClienteUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=100)
    cpf_cnpj: Optional[str] = None
    tipo: Optional[Literal["PF", "PJ"]] = None   # só é aceito se bater com o documento
    telefone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    ativo: Optional[bool] = None

    @field_validator("nome", "telefone", mode="before")
    @classmethod
    def _limpar(cls, v):
        return limpar_texto(v)

    @field_validator("cpf_cnpj", mode="before")
    @classmethod
    def _normalizar(cls, v):
        return _normalizar_documento(v)

    @field_validator("cpf_cnpj")
    @classmethod
    def _validar_documento(cls, v):
        return _exigir_documento_valido(v)

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v):
        return _limitar_email(v)


class ClienteResponse(BaseModel):
    id: int
    nome: str
    cpf_cnpj: str
    tipo: Optional[str]
    telefone: Optional[str]
    email: Optional[str]
    ativo: bool
    created_at: datetime
    updated_at: datetime
    enderecos: List[EnderecoResponse] = []

    model_config = {"from_attributes": True}

    @field_validator("enderecos", mode="after")
    @classmethod
    def _somente_ativos_principal_primeiro(cls, v):
        # A resposta do cliente mostra só os endereços ativos; os inativos ficam
        # disponíveis em GET /clientes/{id}/enderecos?incluir_inativos=true
        ativos = [e for e in v if e.ativo]
        return sorted(ativos, key=lambda e: (e.tipo != "principal", e.id))