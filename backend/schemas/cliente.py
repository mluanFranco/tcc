from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ClienteCreate(BaseModel):
    nome: str
    cpf_cnpj: str
    tipo: Optional[str] = None       # PF ou PJ
    telefone: Optional[str] = None
    email: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    ddd: Optional[str] = None

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    tipo: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    ddd: Optional[str] = None
    ativo: Optional[bool] = None

class ClienteResponse(BaseModel):
    id: int
    nome: str
    cpf_cnpj: str
    tipo: Optional[str]
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