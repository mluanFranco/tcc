from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeSaida


class ItemPedidoVendaCreate(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: Quantidade
    preco_unitario: float = Field(ge=0)
    desconto: float = Field(default=0.0, ge=0)   # valor em reais, não percentual

    @model_validator(mode="after")
    def desconto_nao_excede_o_valor_bruto(self):
        bruto = self.preco_unitario * float(self.quantidade)
        # tolerância de 0,5 centavo para absorver erro de arredondamento de ponto flutuante
        if self.desconto > bruto + 0.005:
            raise ValueError("O desconto não pode ser maior que o valor bruto do item (preço × quantidade).")
        return self


class PedidoVendaCreate(BaseModel):
    cliente_id: int = Field(gt=0)
    forma_pagamento_id: Optional[int] = Field(default=None, gt=0)
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ItemPedidoVendaCreate]

class PedidoVendaStatusUpdate(BaseModel):
    status: str   # aberto | confirmado | cancelado

class ItemPedidoVendaResponse(BaseModel):
    id: int
    produto_id: int
    quantidade: QuantidadeSaida
    preco_unitario: float
    desconto: float
    subtotal: float

    model_config = {"from_attributes": True}

class PedidoVendaResponse(BaseModel):
    id: int
    cliente_id: int
    usuario_id: int
    data_pedido: datetime
    valor_total: float
    status: str
    forma_pagamento_id: Optional[int]
    observacao: Optional[str]
    itens: List[ItemPedidoVendaResponse]

    model_config = {"from_attributes": True}
