from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class HistoricoManutencaoCreate(BaseModel):
    geladeira_id: int = Field(gt=0)
    data: Optional[datetime] = None          # sem data = agora; não pode ser futura
    tipo: str                                # preventiva | corretiva (validado na rota, com 400)
    descricao: Optional[str] = Field(default=None, max_length=500)
    custo: Optional[float] = Field(default=0.0, ge=0, le=9999999.99)
    # Só valem quando há custo: as parcelas da forma viram as contas a pagar (categoria "Manutenção"), com os
    # prazos contados a partir da data da manutenção. Com custo, a forma de pagamento é obrigatória (400 na rota).
    fornecedor_id: Optional[int] = Field(default=None, gt=0)
    forma_pagamento_id: Optional[int] = Field(default=None, gt=0)

    @field_validator("descricao", mode="before")
    @classmethod
    def _limpar_descricao(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("data")
    @classmethod
    def _data_nao_futura(cls, v):
        if v is not None and v.date() > date.today():
            raise ValueError("A data da manutenção não pode ser futura")
        return v

    @field_validator("custo")
    @classmethod
    def _custo_em_centavos(cls, v):
        return 0.0 if v is None else round(v, 2)


class HistoricoManutencaoResponse(BaseModel):
    id: int
    geladeira_id: int
    usuario_id: int
    usuario_nome: Optional[str] = None
    data: datetime
    tipo: str
    descricao: Optional[str]
    custo: float
    forma_pagamento_id: Optional[int] = None
    forma_pagamento_nome: Optional[str] = None   # nulo em manutenção sem custo e nas antigas (vencimento informado)
    # resumo das contas a pagar geradas pelo custo (nulos quando a manutenção não tem custo)
    titulo_id: Optional[int] = None              # primeira parcela (link para o Financeiro)
    titulo_status: Optional[str] = None          # aberto | parcial | pago | cancelado
    titulo_vencimento: Optional[date] = None     # próximo vencimento em aberto
    titulo_parcelas: int = 0
    titulo_parcelas_pagas: int = 0
    fornecedor_nome: Optional[str] = None

    model_config = {"from_attributes": True}
