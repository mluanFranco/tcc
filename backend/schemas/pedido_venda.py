from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ItemPedidoVendaCreate(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float
    desconto: Optional[float] = 0.0

class PedidoVendaCreate(BaseModel):
    cliente_id: int
    forma_pagamento: Optional[str] = None
    observacao: Optional[str] = None
    itens: List[ItemPedidoVendaCreate]

class PedidoVendaStatusUpdate(BaseModel):
    status: str   # aberto | confirmado | cancelado

class ItemPedidoVendaResponse(BaseModel):
    id: int
    produto_id: int
    quantidade: int
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
    forma_pagamento: Optional[str]
    observacao: Optional[str]
    itens: List[ItemPedidoVendaResponse]

    model_config = {"from_attributes": True}