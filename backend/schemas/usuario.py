from pydantic import BaseModel, EmailStr
from typing import Optional

class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    admin: Optional[bool] = False

class UsuarioResponse(BaseModel):
    id: int
    nome: str
    email: str
    ativo: bool
    admin: bool

    class Config:
        from_attributes = True  # permite converter objeto SQLAlchemy para Pydantic

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = None
    admin: Optional[bool] = None
    ativo: Optional[bool] = None