from pydantic import BaseModel, Field, field_validator, model_validator, computed_field
from decimal import Decimal
from typing import Optional
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeZeroOk, QuantidadeSaida


def _limpar_texto(valor):
    return valor.strip() if isinstance(valor, str) else valor


def validar_embalagem(embalagem_unidade_id, fator) -> None:
    """Embalagem e fator andam juntos: com embalagem, o fator é obrigatório e diferente de 1."""
    if embalagem_unidade_id is None:
        if fator is not None and fator != 1:
            raise ValueError("Informe a embalagem (ex.: Pote) para usar um fator diferente de 1.")
        return
    if fator is None:
        raise ValueError("Informe quantas unidades base cabem na embalagem (fator_embalagem).")
    if fator == 1:
        raise ValueError("Embalagem com fator 1 é igual à unidade base: deixe o produto sem embalagem.")


class ProdutoCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    descricao: Optional[str] = Field(default=None, max_length=255)
    categoria_id: int = Field(gt=0)
    subcategoria_id: int = Field(gt=0)
    unidade_medida_id: int = Field(gt=0)
    e_insumo: bool = False
    e_vendavel: bool = False
    preco_custo: float = Field(ge=0)               # da embalagem, se houver
    porcentagem: Optional[float] = Field(default=None, ge=0)
    estoque_minimo: QuantidadeZeroOk = Decimal("0")   # sempre na unidade base
    embalagem_unidade_id: Optional[int] = Field(default=None, gt=0)
    fator_embalagem: Optional[Quantidade] = None   # unidades base por embalagem (ex.: 5 L por pote)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)

    @model_validator(mode="after")
    def valida_tipo_produto(self):
        validar_embalagem(self.embalagem_unidade_id, self.fator_embalagem)
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
    estoque_minimo: Optional[QuantidadeZeroOk] = None
    embalagem_unidade_id: Optional[int] = Field(default=None, gt=0)   # null = tirar a embalagem
    fator_embalagem: Optional[Quantidade] = None
    ativo: Optional[bool] = None

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_nome(cls, v):
        return _limpar_texto(v)

    # As regras cruzadas (tipo do produto, porcentagem, categoria/subcategoria, embalagem)
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
    estoque_atual: QuantidadeSaida
    estoque_reservado: QuantidadeSaida
    estoque_minimo: QuantidadeSaida
    embalagem_unidade_id: Optional[int] = None
    fator_embalagem: QuantidadeSaida = Decimal("1")
    custo_unidade_base: float = 0.0     # preco_custo / fator: o custo que receitas e produção usam
    ativo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def estoque_disponivel(self) -> QuantidadeSaida:
        return self.estoque_atual - self.estoque_reservado