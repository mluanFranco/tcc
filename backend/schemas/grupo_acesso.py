from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime

def _nome_limpo(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Informe o nome do grupo")
    return v

def _descricao_limpa(v: Optional[str]) -> Optional[str]:
    """Tira espaços das pontas; descrição só com espaços vira nula."""
    if v is None:
        return v
    return v.strip() or None

class GrupoAcessoCreate(BaseModel):
    nome: str = Field(max_length=60)
    descricao: Optional[str] = Field(default=None, max_length=255)
    permissoes: List[str] = []

    _nome = field_validator("nome")(_nome_limpo)
    _descricao = field_validator("descricao")(_descricao_limpa)

class GrupoAcessoUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, max_length=60)
    descricao: Optional[str] = Field(default=None, max_length=255)
    ativo: Optional[bool] = None
    permissoes: Optional[List[str]] = None   # se enviada, substitui todas as permissões do grupo

    _nome = field_validator("nome")(_nome_limpo)
    _descricao = field_validator("descricao")(_descricao_limpa)

class GrupoAcessoResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    ativo: bool
    permissoes: List[str]
    total_usuarios: int            # usuários ativos no grupo
    created_at: datetime

class PermissaoResponse(BaseModel):
    codigo: str
    modulo: str
    acao: str
    descricao: str

class ModuloPermissoes(BaseModel):
    """Catálogo agrupado por módulo, na ordem em que a tela de grupos deve listar."""
    modulo: str
    descricao: str
    permissoes: List[PermissaoResponse]
