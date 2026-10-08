from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer

# Decimal entra com precisão e sai como número no JSON (8.5, não "8.500")
_como_numero = PlainSerializer(lambda v: float(v), return_type=float, when_used="json")

# Quantidade que precisa ser maior que zero (itens de pedido, cotação, recebimento)
Quantidade = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3), _como_numero]

# Quantidade que aceita zero (estoque atual e mínimo no cadastro)
QuantidadeZeroOk = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3), _como_numero]

# Para respostas (sem restrição, pode ser 0)
QuantidadeSaida = Annotated[Decimal, _como_numero]