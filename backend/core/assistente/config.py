"""Configuração do assistente, lida do .env a cada uso (facilita os testes)."""
import os
from urllib.parse import quote_plus


def _int(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    try:
        valor = int(os.getenv(nome, padrao))
    except ValueError:
        valor = padrao
    return max(minimo, min(maximo, valor))


def max_linhas() -> int:
    return _int("IA_MAX_LINHAS", 200, 1, 2000)


def timeout_segundos() -> int:
    return _int("IA_TIMEOUT_SEGUNDOS", 5, 1, 60)


def url_banco_ia() -> str:
    """Conexão do usuário SOMENTE LEITURA da IA (mesmo servidor e banco da aplicação, outro usuário)."""
    usuario = os.getenv("IA_DB_USER")
    senha = os.getenv("IA_DB_PASSWORD")
    if not usuario or senha is None:
        raise RuntimeError("Defina IA_DB_USER e IA_DB_PASSWORD no .env (veja scripts/criar_usuario_ia.sql).")
    host, porta, banco = os.getenv("DB_HOST"), os.getenv("DB_PORT"), os.getenv("DB_NAME")
    return f"mysql+pymysql://{quote_plus(usuario)}:{quote_plus(senha)}@{host}:{porta}/{banco}"
