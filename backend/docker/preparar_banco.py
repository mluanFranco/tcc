"""Rotinas de inicialização do banco no Docker (rodadas pelo docker-entrypoint.sh).

  python docker/preparar_banco.py esperar    -> espera o MySQL aceitar conexões (até ~2 min)
  python docker/preparar_banco.py preparar   -> (1) usuário MySQL somente leitura da IA; (2) administrador inicial

Ambas as etapas de "preparar" são idempotentes e opcionais (só rodam se as variáveis existirem):
  - Usuário da IA: precisa de IA_DB_USER, IA_DB_PASSWORD e MYSQL_ROOT_PASSWORD. Recebe SELECT apenas nas views v_*
    (o mesmo que scripts/criar_usuario_ia.sql faz à mão). As views vêm das migrations, por isso roda depois delas.
  - Admin inicial: precisa de ADMIN_EMAIL e ADMIN_SENHA. Só é criado se a tabela usuario estiver VAZIA.
"""
import os
import re
import sys
import time

import bcrypt
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = int(os.getenv("DB_PORT") or 3306)
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_]+$")


def log(msg: str) -> None:
    print(f"[preparar_banco] {msg}", flush=True)


def conectar(usuario: str, senha: str, banco: str | None = None):
    return pymysql.connect(host=DB_HOST, port=DB_PORT, user=usuario, password=senha, database=banco,
                           charset="utf8mb4", autocommit=True, connect_timeout=5)


def esperar(tentativas: int = 60, intervalo: float = 2.0) -> None:
    ultimo_erro = None
    for n in range(1, tentativas + 1):
        try:
            conectar(DB_USER, DB_PASSWORD, DB_NAME).close()
            log("Banco de dados disponível.")
            return
        except Exception as erro:  # noqa: BLE001 - qualquer falha de conexão significa "ainda não"
            ultimo_erro = erro
            log(f"Banco ainda não responde ({n}/{tentativas}): {erro}")
            time.sleep(intervalo)
    log(f"Desisti de esperar o banco: {ultimo_erro}")
    sys.exit(1)


def preparar_usuario_ia() -> None:
    ia_usuario = os.getenv("IA_DB_USER", "").strip()
    ia_senha = os.getenv("IA_DB_PASSWORD")
    root_senha = os.getenv("MYSQL_ROOT_PASSWORD")
    if not ia_usuario or ia_senha is None:
        log("Usuário da IA: IA_DB_USER/IA_DB_PASSWORD não definidos; pulando (o Assistente de IA fica sem acesso ao banco).")
        return
    if not root_senha:
        log("Usuário da IA: MYSQL_ROOT_PASSWORD não definido; pulando.")
        return
    if not _IDENTIFICADOR.match(DB_NAME) or not _IDENTIFICADOR.match(ia_usuario):
        log("Usuário da IA: DB_NAME e IA_DB_USER só podem ter letras, números e _; pulando.")
        return

    conexao = conectar(os.getenv("MYSQL_ROOT_USER", "root"), root_senha)
    try:
        with conexao.cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.views WHERE table_schema = %s AND table_name LIKE 'v\\_%%' ORDER BY 1", (DB_NAME,))
            views = [linha[0] for linha in cur.fetchall()]
            if not views:
                log("Usuário da IA: nenhuma view v_* encontrada (as migrations rodaram?); pulando.")
                return
            cur.execute("CREATE USER IF NOT EXISTS %s@'%%' IDENTIFIED BY %s", (ia_usuario, ia_senha))
            cur.execute("ALTER USER %s@'%%' IDENTIFIED BY %s WITH MAX_USER_CONNECTIONS 5", (ia_usuario, ia_senha))
            for view in views:
                cur.execute(f"GRANT SELECT ON `{DB_NAME}`.`{view}` TO %s@'%%'", (ia_usuario,))
            cur.execute("FLUSH PRIVILEGES")
        log(f"Usuário da IA '{ia_usuario}' pronto: SELECT em {len(views)} views.")
    finally:
        conexao.close()


def preparar_admin() -> None:
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    senha = os.getenv("ADMIN_SENHA", "")
    nome = (os.getenv("ADMIN_NOME") or "Administrador").strip()
    if not email or not senha:
        log("Admin inicial: ADMIN_EMAIL/ADMIN_SENHA não definidos; pulando (crie o primeiro usuário pela API).")
        return
    if "@" not in email or len(senha) < 8 or len(senha.encode()) > 72:
        log("Admin inicial: e-mail inválido ou senha fora de 8 a 72 caracteres; pulando.")
        return

    conexao = conectar(DB_USER, DB_PASSWORD, DB_NAME)
    try:
        with conexao.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM usuario")
            if cur.fetchone()[0] > 0:
                log("Admin inicial: já existem usuários; nada a fazer.")
                return
            senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
            cur.execute("INSERT INTO usuario (nome, email, senha_hash, ativo, admin, created_at, updated_at) "
                        "VALUES (%s, %s, %s, 1, 1, NOW(), NOW())", (nome, email, senha_hash))
        log(f"Administrador inicial criado: {email}")
    finally:
        conexao.close()


if __name__ == "__main__":
    comando = sys.argv[1] if len(sys.argv) > 1 else ""
    if comando == "esperar":
        esperar()
    elif comando == "preparar":
        preparar_usuario_ia()
        preparar_admin()
    else:
        print(__doc__)
        sys.exit(2)
