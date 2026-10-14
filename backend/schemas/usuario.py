from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    admin: Optional[bool] = False
    grupo_id: Optional[int] = Field(default=None, gt=0)

class UsuarioUpdate(BaseModel):
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
