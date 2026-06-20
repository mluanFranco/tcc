from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ItemPedidoCompraCreate(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float

class PedidoCompraCreate(BaseModel):
    fornecedor_id: int
    forma_pagamento_id: Optional[int] = None
    data_entrega_prevista: Optional[datetime] = None
    observacao: Optional[str] = None
    itens: List[ItemPedidoCompraCreate]

class RecebimentoItem(BaseModel):
    item_id: int
    quantidade_recebida_agora: int   # quantidade chegando NESTA entrega, não o acumulado

class RegistrarRecebimento(BaseModel):
    itens: List[RecebimentoItem]

class PedidoCompraStatusUpdate(BaseModel):
    status: str   # apenas "cancelado" é aceito aqui — "recebido" é automático

class ItemPedidoCompraResponse(BaseModel):
    id: int
    produto_id: int
    quantidade: int
    quantidade_recebida: int
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