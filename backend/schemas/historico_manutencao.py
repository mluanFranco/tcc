from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class HistoricoManutencaoCreate(BaseModel):
    geladeira_id: int = Field(gt=0)
    data: Optional[datetime] = None          # sem data = agora; não pode ser futura
    tipo: str                                # preventiva | corretiva (validado na rota, com 400)
    descricao: Optional[str] = Field(default=None, max_length=500)
    custo: Optional[float] = Field(default=0.0, ge=0, le=9999999.99)

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

    model_config = {"from_attributes": True}
