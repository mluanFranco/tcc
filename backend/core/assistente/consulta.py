"""Porta de entrada única para consultas livres da IA: valida -> confere permissão -> executa."""
from typing import Optional, Set

from sqlalchemy.engine import Engine

from core.assistente import config, escopo, executor, sql_seguro
from core.assistente.executor import ErroConsulta, Resultado
from core.assistente.escopo import ErroEscopo
from core.assistente.sql_seguro import ErroSql, SqlValidado

__all__ = ["consultar", "ErroSql", "ErroEscopo", "ErroConsulta", "Resultado"]


def consultar(sql: str, efetivas: Set[str], engine: Optional[Engine] = None):
    """Devolve (Resultado, SqlValidado). Levanta ErroSql, ErroEscopo ou ErroConsulta (todas com mensagem segura)."""
    linhas = config.max_linhas()
    v: SqlValidado = sql_seguro.validar(sql, linhas)
    escopo.verificar(v.views, efetivas)
    return executor.executar(v.sql, linhas, config.timeout_segundos(), engine=engine), v
