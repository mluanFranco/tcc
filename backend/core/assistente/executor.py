"""Executa o SQL já validado com o usuário MySQL somente-leitura da IA (defesa nº 1).
Mesmo que todo o resto falhasse, esse usuário só tem SELECT nas views.
Camadas extras aqui: sessão READ ONLY, tempo máximo por consulta e teto de linhas lidas do banco."""
import datetime
import decimal
from dataclasses import dataclass
from typing import Any, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError

from core.assistente import config

_engine: Optional[Engine] = None

# códigos do MySQL/MariaDB cuja mensagem ajuda a IA a corrigir a consulta
_ERROS_DE_SQL = {1054: "coluna inexistente", 1064: "erro de sintaxe", 1052: "coluna ambígua", 1111: "uso inválido de função de grupo",
                 1140: "mistura de agregação e coluna", 1055: "coluna fora do GROUP BY", 1248: "subconsulta sem apelido",
                 1066: "apelido repetido", 1146: "tabela inexistente", 1305: "função inexistente", 1582: "número de argumentos incorreto"}
_TIMEOUT = {3024, 1969}   # MySQL (MAX_EXECUTION_TIME) e MariaDB (max_statement_time)


class ErroConsulta(Exception):
    """Falha ao executar. A mensagem é segura para ir à IA (nada de senha, host ou caminho)."""


@dataclass
class Resultado:
    colunas: List[str]
    linhas: List[list]
    truncado: bool       # havia mais linhas do que o teto


def obter_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(config.url_banco_ia(), pool_size=5, max_overflow=0, pool_pre_ping=True, pool_recycle=1800)
    return _engine


def reiniciar_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def converter(valor: Any) -> Any:
    """Torna o valor serializável em JSON (o mesmo formato vai para a IA e para a tela)."""
    if valor is None or isinstance(valor, (bool, int, str)):
        return valor
    if isinstance(valor, decimal.Decimal):
        return int(valor) if valor == valor.to_integral_value() else float(valor)
    if isinstance(valor, float):
        return valor
    if isinstance(valor, datetime.datetime):
        return valor.isoformat(sep=" ", timespec="seconds")
    if isinstance(valor, (datetime.date, datetime.time)):
        return valor.isoformat()
    if isinstance(valor, datetime.timedelta):
        return valor.total_seconds()
    if isinstance(valor, (bytes, bytearray)):
        return "<binário>"
    return str(valor)


def _definir_timeout(conn, segundos: int) -> None:
    try:   # MySQL 8: milissegundos (vale só para SELECT)
        conn.exec_driver_sql(f"SET SESSION MAX_EXECUTION_TIME = {segundos * 1000}")
    except DBAPIError:   # MariaDB: segundos
        conn.exec_driver_sql(f"SET SESSION max_statement_time = {segundos}")


def executar(sql: str, max_linhas: int, timeout_s: int, engine: Optional[Engine] = None) -> Resultado:
    eng = engine or obter_engine()
    try:
        with eng.connect() as conn:
            conn.exec_driver_sql("SET SESSION TRANSACTION READ ONLY")
            _definir_timeout(conn, timeout_s)
            cur = conn.execute(text(sql.replace(":", "\\:")))   # ':' dentro de literais não é parâmetro
            colunas = list(cur.keys())
            brutas = cur.fetchmany(max_linhas + 1)
            cur.close()
            conn.rollback()
    except DBAPIError as e:
        codigo = e.orig.args[0] if getattr(e, "orig", None) and e.orig.args and isinstance(e.orig.args[0], int) else None
        if codigo in _TIMEOUT:
            raise ErroConsulta(f"A consulta demorou mais de {timeout_s}s e foi cancelada. Filtre por período ou reduza o volume.")
        if codigo in _ERROS_DE_SQL:
            detalhe = str(e.orig.args[1])[:200] if len(e.orig.args) > 1 else ""
            raise ErroConsulta(f"Erro no SQL ({_ERROS_DE_SQL[codigo]}): {detalhe}")
        raise ErroConsulta("O banco recusou a consulta.")
    truncado = len(brutas) > max_linhas
    linhas = [[converter(v) for v in r] for r in brutas[:max_linhas]]
    return Resultado(colunas=colunas, linhas=linhas, truncado=truncado)
