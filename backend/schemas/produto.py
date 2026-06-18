from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ProdutoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    unidade_medida: Optional[str] = None
    preco_custo: float
    preco_venda: Optional[float] = None
    estoque_minimo: Optional[int] = 0

class ProdutoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    unidade_medida: Optional[str] = None
    preco_custo: Optional[float] = None
    preco_venda: Optional[float] = None
    estoque_minimo: Optional[int] = None
    ativo: Optional[bool] = None

class ProdutoResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str]
    categoria: Optional[str]
    unidade_medida: Optional[str]
    preco_custo: float
    preco_venda: Optional[float]
    estoque_atual: int
    estoque_minimo: int
    ativo: bool
    created_at: datetime

    model_config = {"from_attributes": True}