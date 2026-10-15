"""Configuração do assistente, lida do .env a cada uso (facilita os testes)."""
import os
from urllib.parse import quote_plus


# O Google retira/limita modelos com o tempo (o 2.5 já não é liberado para contas novas). Se der 404, rode:
#   python scripts/testar_gemini.py --modelos      e coloque o modelo indicado em IA_MODELO no .env
MODELO_PADRAO = "gemini-3.6-flash"
RESERVA_PADRAO = "gemini-3.5-flash-lite,gemini-3.1-flash-lite"


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


def _bool(nome: str, padrao: bool) -> bool:
    valor = os.getenv(nome)
    if valor is None or valor.strip() == "":
        return padrao
    return valor.strip().lower() in ("1", "true", "sim", "yes", "on")


def api_key() -> str:
    return (os.getenv("GEMINI_API_KEY") or "").strip()


def modelo() -> str:
    return (os.getenv("IA_MODELO") or MODELO_PADRAO).strip()


def habilitado() -> bool:
    """Ligado quando IA_HABILITADO não é 'false' E existe GEMINI_API_KEY."""
    return _bool("IA_HABILITADO", True) and bool(api_key())


def modo_privado() -> bool:
    """True: os DADOS retornados pelas consultas não são enviados ao provedor; só nomes de colunas e quantidade de linhas.
    A tabela continua aparecendo para o usuário."""
    return _bool("IA_MODO_PRIVADO", False)


def limite_por_hora() -> int:
    return _int("IA_LIMITE_POR_HORA", 20, 1, 1000)


def max_passos() -> int:
    """Quantas rodadas de ferramenta a IA pode fazer por pergunta."""
    return _int("IA_MAX_PASSOS", 4, 1, 8)


def timeout_provedor_segundos() -> int:
    return _int("IA_TIMEOUT_PROVEDOR", 40, 5, 120)


def banco_ia_configurado() -> bool:
    return bool(os.getenv("IA_DB_USER")) and os.getenv("IA_DB_PASSWORD") is not None


def raciocinio() -> str:
    """Esforço de 'raciocínio' dos modelos gemini-3.x: minimal | low | medium | high. Menos raciocínio = resposta mais rápida e barata
    (e menos 504). 'low' basta para escrever SQL a partir do esquema."""
    valor = (os.getenv("IA_RACIOCINIO") or "low").strip().lower()
    return valor if valor in ("minimal", "low", "medium", "high") else "low"


def modelos_reserva() -> list:
    """Modelos tentados, em ordem, quando o principal fica fora do ar (IA_MODELO_RESERVA=a,b). Vazio desliga a reserva."""
    bruto = os.getenv("IA_MODELO_RESERVA")
    bruto = RESERVA_PADRAO if bruto is None else bruto
    return [m.strip() for m in bruto.split(",") if m.strip()]
