from datetime import date
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, PlainSerializer, computed_field, field_validator

from core.pagamento import classificar_forma

_como_numero = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")

Percentual = Annotated[Decimal, Field(gt=0, le=100, max_digits=5, decimal_places=2), _como_numero]
PercentualSaida = Annotated[Decimal, _como_numero]


class ParcelaCreate(BaseModel):
    """O número da parcela é a posição na lista (1ª, 2ª, 3ª...); não precisa ser informado."""
    prazo_dias: int = Field(ge=0, le=3650)      # dias após a data base (0 = no ato)
    percentual: Percentual                      # quanto do total vai nesta parcela


def _validar_parcelas(parcelas):
    if parcelas is None:
        return parcelas
    if sum(p.percentual for p in parcelas) != Decimal("100"):
        raise ValueError("A soma dos percentuais das parcelas deve ser exatamente 100")
    prazos = [p.prazo_dias for p in parcelas]
    if prazos != sorted(prazos):
        raise ValueError("Os prazos das parcelas não podem diminuir de uma parcela para a seguinte")
    return parcelas


def _validar_descricao(valor):
    if valor is None:
        return valor
    valor = valor.strip()
    if not valor:
        raise ValueError("A descrição não pode ficar vazia")
    return valor


class FormaPagamentoCreate(BaseModel):
    descricao: str = Field(max_length=100)
    taxa_percentual: float = Field(default=0.0, ge=0, le=100)
    parcelas: List[ParcelaCreate] = Field(min_length=1, max_length=24)

    _descricao = field_validator("descricao")(_validar_descricao)
    _parcelas = field_validator("parcelas")(_validar_parcelas)


class FormaPagamentoUpdate(BaseModel):
    """Campos omitidos não mudam. Se `parcelas` vier, SUBSTITUI a lista inteira."""
    descricao: Optional[str] = Field(default=None, max_length=100)
    taxa_percentual: Optional[float] = Field(default=None, ge=0, le=100)
    parcelas: Optional[List[ParcelaCreate]] = Field(default=None, min_length=1, max_length=24)

    _descricao = field_validator("descricao")(_validar_descricao)
    _parcelas = field_validator("parcelas")(_validar_parcelas)


class ParcelaResponse(BaseModel):
    numero: int
    prazo_dias: int
    percentual: PercentualSaida

    model_config = {"from_attributes": True}


class FormaPagamentoResponse(BaseModel):
    id: int
    descricao: str
    taxa_percentual: float
    ativo: bool
    parcelas: List[ParcelaResponse]

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def tipo(self) -> str:
        return classificar_forma(self.parcelas)


class ParcelaSimulada(BaseModel):
    numero: int
    vencimento: date
    percentual: PercentualSaida
    valor: PercentualSaida


class SimulacaoPagamentoResponse(BaseModel):
    forma_pagamento_id: int
    descricao: str
    tipo: str
    valor_total: PercentualSaida
    data_base: date
    parcelas: List[ParcelaSimulada]
