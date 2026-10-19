from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional
from datetime import datetime

SENHA_MINIMA = 8
SENHA_MAXIMA_BYTES = 72     # o bcrypt só considera os 72 primeiros bytes: melhor recusar do que cortar em silêncio


def _nome_valido(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = " ".join(v.split())
    if not v:
        raise ValueError("Informe o nome do usuário")
    if len(v) > 100:
        raise ValueError("O nome pode ter no máximo 100 caracteres")
    return v


def _email_normalizado(v):
    return v.strip().lower() if isinstance(v, str) else v


def _senha_valida(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if len(v) < SENHA_MINIMA:
        raise ValueError(f"A senha deve ter no mínimo {SENHA_MINIMA} caracteres")
    if len(v.encode("utf-8")) > SENHA_MAXIMA_BYTES:
        raise ValueError(f"A senha é longa demais (máximo de {SENHA_MAXIMA_BYTES} bytes, cerca de {SENHA_MAXIMA_BYTES} caracteres sem acentos)")
    return v


class _CamposDeUsuario(BaseModel):
    _nome = field_validator("nome", check_fields=False)(_nome_valido)
    _senha = field_validator("senha", check_fields=False)(_senha_valida)

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _email(cls, v):
        return _email_normalizado(v)


class UsuarioCreate(_CamposDeUsuario):
    nome: str
    email: EmailStr
    senha: str
    admin: Optional[bool] = False
    grupo_id: Optional[int] = Field(default=None, gt=0)

class UsuarioUpdate(_CamposDeUsuario):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = None
    admin: Optional[bool] = None
    ativo: Optional[bool] = None
    grupo_id: Optional[int] = Field(default=None, gt=0)   # enviar null remove o usuário do grupo

class UsuarioResponse(BaseModel):
    id: int
    nome: str
    email: str
    ativo: bool
    admin: bool
    grupo_id: Optional[int] = None
    foto_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class GrupoResumo(BaseModel):
    id: int
    nome: str

class UsuarioMeResponse(BaseModel):
    """O que o front-end precisa para montar menus e botões: permissões já calculadas."""
    id: int
    nome: str
    email: str
    admin: bool
    grupo: Optional[GrupoResumo] = None
    foto_url: Optional[str] = None
    permissoes: List[str]          # efetivas (grupo + extras; admin = todas)
    permissoes_extras: List[str]   # só as concedidas diretamente ao usuário

class PermissoesDoUsuarioUpdate(BaseModel):
    permissoes: List[str]          # substitui as permissões extras do usuário

class PermissoesDoUsuarioResponse(BaseModel):
    admin: bool
    grupo: Optional[GrupoResumo] = None
    do_grupo: List[str]
    extras: List[str]
    efetivas: List[str]
