from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from schemas.tipos import Quantidade, QuantidadeSaida

class ItemPedidoCompraCreate(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: Quantidade
    preco_unitario: float = Field(ge=0)

class PedidoCompraCreate(BaseModel):
    fornecedor_id: int = Field(gt=0)
    forma_pagamento_id: Optional[int] = Field(default=None, gt=0)
    data_entrega_prevista: Optional[datetime] = None
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ItemPedidoCompraCreate]

class RecebimentoItem(BaseModel):
    item_id: int = Field(gt=0)
    quantidade_recebida_agora: Quantidade   # quantidade chegando NESTA entrega, não o acumulado

class RegistrarRecebimento(BaseModel):
    itens: List[RecebimentoItem]

class PedidoCompraStatusUpdate(BaseModel):
    status: str   # apenas "cancelado" é aceito aqui — "recebido" é automático

class ItemPedidoCompraResponse(BaseModel):
    id: int
    produto_id: int
    quantidade: QuantidadeSaida
    quantidade_recebida: QuantidadeSaida
    preco_unitario: float
    subtotal: float

    model_config = {"from_attributes": True}

class PedidoCompraResponse(BaseModel):
    id: int
    fornecedor_id: int
    usuario_id: int
    forma_pagamento_id: Optional[int]
    data_pedido: datetime
    data_entrega_prevista: Optional[datetime]
    valor_total: float
    status: str
    observacao: Optional[str]
    itens: List[ItemPedidoCompraResponse]

    model_config = {"from_attributes": True}
