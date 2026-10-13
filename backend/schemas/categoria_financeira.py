from pydantic import BaseModel, Field, field_validator


def _limpar_nome(v):
    v = v.strip()
    if not v:
        raise ValueError("O nome não pode ficar vazio")
    return v


class CategoriaFinanceiraCreate(BaseModel):
    nome: str = Field(max_length=100)
    tipo: str = Field(pattern="^(pagar|receber)$")   # a categoria vale só para títulos deste tipo

    @field_validator("nome")
    @classmethod
    def _nome_sem_espacos(cls, v):
        return _limpar_nome(v)


class CategoriaFinanceiraUpdate(BaseModel):
    nome: str = Field(max_length=100)    # o tipo não muda: os títulos já lançados dependem dele

    @field_validator("nome")
    @classmethod
    def _nome_sem_espacos(cls, v):
        return _limpar_nome(v)


class CategoriaFinanceiraResponse(BaseModel):
    id: int
    nome: str
    tipo: str
    sistema: bool
    ativo: bool

    model_config = {"from_attributes": True}
