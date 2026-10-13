from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, PlainSerializer, computed_field, field_validator

_como_numero = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")

# Dinheiro: até 12 dígitos, 2 casas (3 casas ou mais → 422, nada de arredondar em silêncio)
DinheiroPositivo = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2), _como_numero]
DinheiroSaida = Annotated[Decimal, _como_numero]


class BaixaCreate(BaseModel):
    valor: DinheiroPositivo
    data_pagamento: Optional[date] = None      # sem data = hoje
    observacao: Optional[str] = Field(default=None, max_length=255)

    @field_validator("data_pagamento")
    @classmethod
    def nao_pode_ser_futura(cls, v):
        if v is not None and v > date.today():
            raise ValueError("A data do pagamento não pode ser futura")
        return v

    @field_validator("observacao")
    @classmethod
    def limpar_observacao(cls, v):
        if v is None:
            return None
        v = v.strip()
        return v or None


class BaixaResponse(BaseModel):
    id: int
    titulo_id: int
    valor: DinheiroSaida
    data_pagamento: date
    usuario_id: int
    observacao: Optional[str]
    estornada: bool
    estornada_em: Optional[datetime]
    estornada_por_id: Optional[int]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TituloResponse(BaseModel):
    id: int
    tipo: str
    pedido_venda_id: Optional[int]
    pedido_compra_id: Optional[int]
    cliente_id: Optional[int]
    cliente_nome: Optional[str]
    fornecedor_id: Optional[int]
    fornecedor_nome: Optional[str]
    numero_parcela: int
    total_parcelas: int
    vencimento: date
    valor: DinheiroSaida
    taxa_percentual: DinheiroSaida
    valor_pago: DinheiroSaida
    status: str

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def saldo(self) -> DinheiroSaida:
        return self.valor - self.valor_pago

    @computed_field
    @property
    def vencido(self) -> bool:
        return self.status in ("aberto", "parcial") and self.vencimento < date.today()

    @computed_field
    @property
    def dias_atraso(self) -> int:
        return (date.today() - self.vencimento).days if self.vencido else 0

    @computed_field
    @property
    def origem(self) -> str:
        if self.pedido_venda_id:
            return f"Pedido de venda #{self.pedido_venda_id}"
        if self.pedido_compra_id:
            return f"Pedido de compra #{self.pedido_compra_id}"
        return "Lançamento avulso"


class TituloDetalheResponse(TituloResponse):
    baixas: List[BaixaResponse]
