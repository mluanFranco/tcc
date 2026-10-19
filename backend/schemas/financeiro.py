from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, PlainSerializer, computed_field, field_validator, model_validator

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
    categoria_id: int
    categoria_nome: Optional[str]
    descricao: Optional[str]
    avulso: bool
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
        return self.descricao or "Lançamento avulso"


class TituloDetalheResponse(TituloResponse):
    baixas: List[BaixaResponse]


def _limpar_descricao(v):
    v = v.strip()
    if not v:
        raise ValueError("A descrição não pode ficar vazia")
    return v


class TituloAvulsoCreate(BaseModel):
    """Lançamento sem pedido: aluguel, energia, folha... `repetir_meses` cria um título por mês."""
    tipo: str = Field(pattern="^(pagar|receber)$")
    descricao: str = Field(max_length=255)
    categoria_id: int = Field(gt=0)
    valor: DinheiroPositivo
    vencimento: date
    cliente_id: Optional[int] = Field(default=None, gt=0)       # só em 'receber'
    fornecedor_id: Optional[int] = Field(default=None, gt=0)    # só em 'pagar'
    repetir_meses: Optional[int] = Field(default=None, ge=2, le=60)

    @field_validator("descricao")
    @classmethod
    def _descricao_sem_espacos(cls, v):
        return _limpar_descricao(v)

    @model_validator(mode="after")
    def parte_compativel_com_o_tipo(self):
        if self.tipo == "pagar" and self.cliente_id is not None:
            raise ValueError("Título a pagar não tem cliente: informe um fornecedor (ou nenhum)")
        if self.tipo == "receber" and self.fornecedor_id is not None:
            raise ValueError("Título a receber não tem fornecedor: informe um cliente (ou nenhum)")
        return self


class TituloAvulsoUpdate(BaseModel):
    """Atualização parcial: só o que for enviado muda. cliente_id/fornecedor_id aceitam null para remover a parte."""
    descricao: Optional[str] = Field(default=None, max_length=255)
    categoria_id: Optional[int] = Field(default=None, gt=0)
    valor: Optional[DinheiroPositivo] = None
    vencimento: Optional[date] = None
    cliente_id: Optional[int] = Field(default=None, gt=0)
    fornecedor_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def nao_aceitar_null_nos_obrigatorios(self):
        for nome in ("descricao", "categoria_id", "valor", "vencimento"):
            if nome in self.model_fields_set and getattr(self, nome) is None:
                raise ValueError(f"'{nome}' não pode ser nulo")
        if self.descricao is not None:
            self.descricao = _limpar_descricao(self.descricao)
        return self


class GrupoResumo(BaseModel):
    quantidade: int
    saldo: DinheiroSaida


class ResumoTitulosResponse(BaseModel):
    """Totais dos títulos filtrados. `saldo` = valor - valor_pago dos títulos aberto/parcial."""
    quantidade: int            # todos os que passam no filtro, inclusive pagos e cancelados
    em_aberto: GrupoResumo     # aberto + parcial
    vencido: GrupoResumo       # parte de em_aberto que já passou do vencimento
    a_vencer: GrupoResumo      # parte de em_aberto que ainda não venceu
    total_pago: DinheiroSaida  # soma das baixas válidas (pago/recebido) dos não cancelados
