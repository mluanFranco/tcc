from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Optional
from datetime import datetime


class MensagemCreate(BaseModel):
    conversa_id: Optional[int] = None          # sem conversa_id: abre uma conversa nova
    texto: str = Field(max_length=2000)

    @field_validator("texto")
    @classmethod
    def _texto(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Escreva a pergunta")
        return v


class TabelaResponse(BaseModel):
    colunas: List[str]
    linhas: List[List[Any]]
    truncado: bool = False


class MensagemResponse(BaseModel):
    conversa_id: int
    mensagem_id: int
    resposta: str
    tabela: Optional[TabelaResponse] = None
    consultas: List[str] = []                  # SQL executado (transparência: o usuário pode conferir)
    restantes_na_hora: int


class MensagemHistorico(BaseModel):
    id: int
    papel: str
    conteudo: str
    tabela: Optional[TabelaResponse] = None
    consultas: List[str] = []
    created_at: datetime


class ConversaResponse(BaseModel):
    id: int
    titulo: str
    created_at: datetime
    updated_at: datetime


class ConversaDetalheResponse(ConversaResponse):
    mensagens: List[MensagemHistorico]


class StatusResponse(BaseModel):
    habilitado: bool
    modelo: Optional[str] = None
    modo_privado: bool
    banco_configurado: bool
    limite_por_hora: int
    restantes_na_hora: int


class LogResponse(BaseModel):
    id: int
    usuario_id: int
    usuario_nome: Optional[str] = None
    conversa_id: Optional[int] = None
    pergunta: Optional[str] = None
    ferramenta: str
    entrada: Optional[str] = None
    views: Optional[str] = None
    status: str
    linhas: Optional[int] = None
    duracao_ms: Optional[int] = None
    erro: Optional[str] = None
    created_at: datetime


class AuditoriaResponse(BaseModel):
    total: int
    itens: List[LogResponse]


class AuditoriaResumoResponse(BaseModel):
    total: int
    por_status: Dict[str, int]                 # contagem por status (ok, sql_recusado, ...)
    recusados: int                             # sql_recusado + sem_permissao (tentativas barradas pelas travas)
    erros: int                                 # erro_execucao + erro_ferramenta + erro_provedor
    duracao_media_ms: Optional[int] = None     # média só das ferramentas que registraram duração
    usuarios: int                              # usuários distintos no período
