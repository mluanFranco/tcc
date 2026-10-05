from pydantic import BaseModel, Field, field_validator, model_validator, computed_field
from typing import Optional
from datetime import datetime


def _limpar_texto(valor):
    return valor.strip() if isinstance(valor, str) else valor


class ProdutoCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    descricao: Optional[str] = Field(default=None, max_length=255)
    categoria_id: int = Field(gt=0)
    subcategoria_id: int = Field(gt=0)
    unidade_medida_id: int = Field(gt=0)
    e_insumo: bool = False
    e_vendavel: bool = False
    preco_custo: float = Field(ge=0)
    porcentagem: Optional[float] = Field(default=None, ge=0)
    estoque_minimo: int = Field(default=0, ge=0)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)

    @model_validator(mode="after")
    def valida_tipo_produto(self):
        if not self.e_insumo and not self.e_vendavel:
            raise ValueError(
                "O produto precisa ser ao menos um dos dois: insumo (e_insumo) ou vendável (e_vendavel)."
            )
        if self.e_vendavel and self.porcentagem is None:
            raise ValueError(
                "Produtos vendáveis (e_vendavel=True) precisam informar 'porcentagem' para cálculo do preço de venda."
            )
        return self


class ProdutoUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=100)
    descricao: Optional[str] = Field(default=None, max_length=255)
    categoria_id: Optional[int] = Field(default=None, gt=0)
    subcategoria_id: Optional[int] = Field(default=None, gt=0)
    unidade_medida_id: Optional[int] = Field(default=None, gt=0)
    e_insumo: Optional[bool] = None
    e_vendavel: Optional[bool] = None
    preco_custo: Optional[float] = Field(default=None, ge=0)
    porcentagem: Optional[float] = Field(default=None, ge=0)
    estoque_minimo: Optional[int] = Field(default=None, ge=0)
    ativo: Optional[bool] = None

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)

    # As regras cruzadas (tipo do produto, porcentagem, categoria/subcategoria)
    # dependem do estado atual no banco, então ficam na route.


class ProdutoResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str]
    categoria_id: int
    subcategoria_id: int
    unidade_medida_id: int
    e_insumo: bool
    e_vendavel: bool
    preco_custo: float
    porcentagem: Optional[float]
    preco_venda: Optional[float]
    estoque_atual: int
    estoque_reservado: int
    estoque_minimo: int
    ativo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def estoque_disponivel(self) -> int:
        return self.estoque_atual - self.estoque_reservado