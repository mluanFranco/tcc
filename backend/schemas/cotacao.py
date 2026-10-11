from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from schemas.tipos import Quantidade, QuantidadeSaida


def _itens_sem_repeticao_e_com_desconto_valido(itens):
    if itens is None:
        return itens
    ids = [i.produto_id for i in itens]
    if len(ids) != len(set(ids)):
        raise ValueError("Produto repetido na cotação: some as quantidades em uma única linha")
    for item in itens:
        if item.preco_unitario is not None and item.desconto > item.preco_unitario * float(item.quantidade) + 0.005:
            raise ValueError("O desconto não pode ser maior que o valor bruto do item (preço × quantidade)")
    return itens


def _validade_nao_vencida(valor):
    if valor is not None and valor < date.today():
        raise ValueError("A validade não pode estar no passado")
    return valor


class ItemCotacaoCreate(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: Quantidade
    preco_unitario: Optional[float] = Field(default=None, ge=0)   # em compra pode aguardar a resposta do fornecedor
    desconto: float = Field(default=0.0, ge=0)                    # em reais; só em cotação de venda
    observacao: Optional[str] = Field(default=None, max_length=255)


class CotacaoCreate(BaseModel):
    tipo: Literal["compra", "venda"]
    fornecedor_id: Optional[int] = Field(default=None, gt=0)   # obrigatório em compra
    cliente_id: Optional[int] = Field(default=None, gt=0)      # obrigatório em venda
    forma_pagamento_id: Optional[int] = Field(default=None, gt=0)
    validade: Optional[date] = None
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: List[ItemCotacaoCreate] = Field(min_length=1)

    _validade = field_validator("validade")(_validade_nao_vencida)
    _itens = field_validator("itens")(_itens_sem_repeticao_e_com_desconto_valido)

    @model_validator(mode="after")
    def coerencia_do_tipo(self):
        if self.tipo == "compra":
            if self.fornecedor_id is None:
                raise ValueError("Cotação de compra exige fornecedor_id")
            if self.cliente_id is not None:
                raise ValueError("Cotação de compra não tem cliente: informe só o fornecedor")
            if any(i.desconto != 0 for i in self.itens):
                raise ValueError("Desconto só existe em cotação de venda")
        else:
            if self.cliente_id is None:
                raise ValueError("Cotação de venda exige cliente_id")
            if self.fornecedor_id is not None:
                raise ValueError("Cotação de venda não tem fornecedor: informe só o cliente")
            if any(i.preco_unitario is None for i in self.itens):
                raise ValueError("Em cotação de venda todos os itens precisam de preco_unitario")
        return self


class CotacaoUpdate(BaseModel):
    """Campos omitidos não mudam. Se `itens` vier, SUBSTITUI a lista inteira."""
    forma_pagamento_id: Optional[int] = Field(default=None, gt=0)
    validade: Optional[date] = None
    observacao: Optional[str] = Field(default=None, max_length=255)
    itens: Optional[List[ItemCotacaoCreate]] = Field(default=None, min_length=1)

    _validade = field_validator("validade")(_validade_nao_vencida)
    _itens = field_validator("itens")(_itens_sem_repeticao_e_com_desconto_valido)


class CotacaoUpdateStatus(BaseModel):
    status: str   # rascunho | enviada | recebida | aprovada | recusada  ("aprovada" só via POST /{id}/aprovar)


class ItemCotacaoResponse(BaseModel):
    id: int
    produto_id: int
    quantidade: QuantidadeSaida
    preco_unitario: Optional[float]
    desconto: float
    observacao: Optional[str]

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def subtotal(self) -> Optional[float]:
        if self.preco_unitario is None:
            return None
        return max(0.0, round(self.preco_unitario * float(self.quantidade) - self.desconto, 2))


class CotacaoResponse(BaseModel):
    id: int
    tipo: str
    fornecedor_id: Optional[int]
    cliente_id: Optional[int]
    usuario_id: int
    forma_pagamento_id: Optional[int]
    data_cotacao: datetime
    validade: Optional[date]
    status: str
    observacao: Optional[str]
    pedido_venda_id: Optional[int]
    pedido_compra_id: Optional[int]
    itens: List[ItemCotacaoResponse]

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def valor_total(self) -> Optional[float]:
        subtotais = [i.subtotal for i in self.itens]
        if any(s is None for s in subtotais):
            return None   # ainda há itens sem preço
        return round(sum(subtotais), 2)


class AprovacaoResponse(BaseModel):
    cotacao: CotacaoResponse
    pedido_tipo: Literal["compra", "venda"]
    pedido_id: int


class ComparativoFornecedor(BaseModel):
    fornecedor_id: int
    fornecedor_nome: str
    cotacao_id: int
    status: str
    preco_unitario: float
    quantidade: QuantidadeSaida
    data_cotacao: datetime

    model_config = {"from_attributes": True}
