"""Verificações DETERMINÍSTICAS das camadas de defesa do assistente (item 15c). Não usam o Gemini: o resultado é sempre o mesmo.
Cada tentativa de ataque precisa ser BLOQUEADA, e cada uso legítimo precisa ser PERMITIDO. Só lê o banco
(as tentativas de escrita são inofensivas: WHERE 1 = 0, objetos inexistentes ou de nome de teste, e limpos ao final).

Camadas verificadas:
  1  banco: o usuário sistema_ia só tem SELECT nas 15 views (conferido com SHOW GRANTS e com tentativas reais de escrita)
  2  views sem dados pessoais e documentadas (colunas do banco = colunas do esquema, nenhuma coluna sensível)
  3  validador de SQL (comandos, comentários, vários comandos, tabelas reais, funções perigosas, junções caras)
  4  permissão por módulo (view financeira sem financeiro.ver etc.)
  5  limites de tempo e de linhas"""
import logging
import re
import time
from typing import Any, Callable, Dict, List, Tuple

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from core.assistente import config, escopo, executor, sql_seguro
from core.assistente.esquema import VIEWS
from core.assistente.executor import ErroConsulta
from core.assistente.escopo import ErroEscopo
from core.assistente.sql_seguro import ErroSql
from core.permissoes import CODIGOS

logging.getLogger("sqlglot").setLevel(logging.ERROR)   # o aviso de "sintaxe não suportada" é esperado nos ataques e só poluiria a tela

C1, C2, C3, C4, C5 = "1-banco", "2-views", "3-validador", "4-permissao", "5-limites"
SO_ASSISTENTE = {"assistente.ver"}
SEM_FINANCEIRO = {"vendas.ver", "assistente.ver"}
_COLUNAS_SENSIVEIS = ("cpf", "cnpj", "telefone", "celular", "email", "senha", "hash", "token", "endereco", "cep", "logradouro", "foto")
_ERROS_DE_PRIVILEGIO = {1044, 1045, 1142, 1143, 1227, 1370, 1290, 1792, 1410}

# (descrição, SQL) — o validador precisa recusar TODOS
ATAQUES_AO_VALIDADOR: Tuple[Tuple[str, str], ...] = (
    ("apagar tabela", "DROP TABLE produto"),
    ("apagar view", "DROP VIEW v_vendas"),
    ("alterar dados", "UPDATE v_produtos SET ativo = 0"),
    ("apagar linhas", "DELETE FROM v_vendas"),
    ("inserir linhas", "INSERT INTO v_clientes (id, nome) VALUES (999, 'x')"),
    ("esvaziar tabela", "TRUNCATE TABLE produto"),
    ("alterar estrutura", "ALTER TABLE produto ADD COLUMN x INT"),
    ("criar tabela", "CREATE TABLE t (a INT)"),
    ("dar permissões", "GRANT ALL ON *.* TO 'x'@'%'"),
    ("mudar configuração do servidor", "SET GLOBAL max_connections = 1"),
    ("trocar de banco", "USE mysql"),
    ("dois comandos (injeção clássica)", "SELECT 1 FROM v_produtos; DROP TABLE produto"),
    ("dois SELECTs", "SELECT id FROM v_produtos; SELECT id FROM v_clientes"),
    ("comentário de linha", "SELECT id FROM v_produtos -- x"),
    ("comentário de bloco", "SELECT /* x */ id FROM v_produtos"),
    ("comentário #", "SELECT id FROM v_produtos # x"),
    ("tabela real de usuários", "SELECT * FROM usuario"),
    ("hash de senha", "SELECT senha_hash FROM usuario"),
    ("tabela real de clientes", "SELECT * FROM cliente"),
    ("esquema interno", "SELECT * FROM information_schema.tables"),
    ("tabela de contas do MySQL", "SELECT * FROM mysql.user"),
    ("tabela real escondida em JOIN", "SELECT * FROM v_produtos p JOIN usuario u ON 1 = 1"),
    ("tabela real escondida em subconsulta", "SELECT * FROM (SELECT * FROM usuario) x"),
    ("tabela real escondida em WITH", "WITH t AS (SELECT * FROM usuario) SELECT * FROM t"),
    ("ler arquivo do servidor", "SELECT LOAD_FILE('/etc/passwd')"),
    ("travar o servidor com SLEEP", "SELECT SLEEP(30)"),
    ("travar o servidor com BENCHMARK", "SELECT BENCHMARK(100000000, MD5('a'))"),
    ("gravar arquivo", "SELECT id FROM v_produtos INTO OUTFILE '/tmp/x'"),
    ("variável de sistema", "SELECT @@version"),
    ("variável de usuário", "SELECT @x := 1"),
    ("bloquear linhas", "SELECT id FROM v_produtos FOR UPDATE"),
    ("produto cartesiano com CROSS JOIN", "SELECT COUNT(*) FROM v_produtos a CROSS JOIN v_produtos b"),
    ("produto cartesiano com vírgula", "SELECT COUNT(*) FROM v_produtos a, v_produtos b"),
    ("recursão infinita", "WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r) SELECT * FROM r"),
)

# (descrição, SQL, permissões do usuário) — o escopo precisa NEGAR
NEGADOS_PELO_ESCOPO: Tuple[Tuple[str, str, set], ...] = (
    ("títulos financeiros sem financeiro.ver", "SELECT SUM(saldo) FROM v_titulos", SEM_FINANCEIRO),
    ("baixas sem financeiro.ver", "SELECT COUNT(*) FROM v_baixas", SEM_FINANCEIRO),
    ("margem sem relatorios.ver", "SELECT SUM(margem) FROM v_venda_margem", SEM_FINANCEIRO),
    ("compras sem compras.ver", "SELECT COUNT(*) FROM v_compras", SEM_FINANCEIRO),
    ("produção sem producao.ver", "SELECT COUNT(*) FROM v_producao", SEM_FINANCEIRO),
    ("view financeira escondida em JOIN", "SELECT v.id FROM v_vendas v JOIN v_titulos t ON t.pedido_id = v.id", SEM_FINANCEIRO),
    ("view financeira escondida em subconsulta", "SELECT (SELECT SUM(saldo) FROM v_titulos) AS x FROM v_vendas", SEM_FINANCEIRO),
)

# (descrição, SQL, permissões) — precisa ser PERMITIDO (e o validador não pode estragar o uso legítimo)
PERMITIDOS: Tuple[Tuple[str, str, set], ...] = (
    ("vendas com vendas.ver", "SELECT status, COUNT(*) AS n FROM v_vendas GROUP BY status", SEM_FINANCEIRO),
    ("cadastros são livres para quem usa o assistente", "SELECT COUNT(*) FROM v_produtos WHERE ativo = 1", SO_ASSISTENTE),
    ("administrador lê a view financeira", "SELECT SUM(saldo) FROM v_titulos", set(CODIGOS)),
    ("junção de duas views com permissão", "SELECT v.status, COUNT(*) FROM v_vendas v JOIN v_venda_itens i ON i.pedido_venda_id = v.id GROUP BY v.status", SEM_FINANCEIRO),
)

# tentativas feitas com o usuário sistema_ia DIRETO no banco, sem passar pelo validador (camada 1 sozinha)
TENTATIVAS_NO_BANCO: Tuple[Tuple[str, str], ...] = (
    ("ler tabela de usuários", "SELECT * FROM usuario LIMIT 1"),
    ("ler tabela de clientes", "SELECT * FROM cliente LIMIT 1"),
    ("ler contas do MySQL", "SELECT * FROM mysql.user LIMIT 1"),
    ("inserir em tabela", "INSERT INTO usuario (nome) VALUES ('x')"),
    ("alterar tabela", "UPDATE produto SET nome = nome WHERE 1 = 0"),
    ("apagar de tabela", "DELETE FROM produto WHERE 1 = 0"),
    ("alterar através de view", "UPDATE v_produtos SET nome = nome WHERE 1 = 0"),
    ("apagar através de view", "DELETE FROM v_vendas WHERE 1 = 0"),
    ("criar tabela", "CREATE TABLE zz_teste_defesa_ia (a INT)"),
    ("criar view", "CREATE VIEW zz_view_teste_defesa_ia AS SELECT 1 AS a"),
    ("apagar view", "DROP VIEW IF EXISTS zz_view_inexistente_ia"),
)
_LIMPEZA = ("DROP TABLE IF EXISTS zz_teste_defesa_ia", "DROP VIEW IF EXISTS zz_view_teste_defesa_ia")


def _r(camada: str, tentativa: str, esperado: str, ok: bool, detalhe: str = "", incerto: bool = False) -> Dict[str, Any]:
    return {"camada": camada, "tentativa": tentativa, "esperado": esperado,
            "resultado": "OK" if ok else ("INCERTO" if incerto else "FALHA"), "detalhe": detalhe}


def _usuario_e_privilegios() -> List[Dict[str, Any]]:
    """SHOW GRANTS: só SELECT nas 15 views (e USAGE, que não dá nada)."""
    eng = executor.obter_engine()
    with eng.connect() as con:
        concessoes = [str(l[0]) for l in con.execute(text("SHOW GRANTS FOR CURRENT_USER()")).fetchall()]
    indevidos, objetos = [], set()
    for g in concessoes:
        m = re.match(r"GRANT (.+?) ON (.+?) TO ", g, re.IGNORECASE)
        if not m:
            indevidos.append(g[:80])
            continue
        privs, alvo = m.group(1).strip().upper(), m.group(2).replace("`", "")
        if privs == "USAGE":
            continue
        if privs != "SELECT":
            indevidos.append(f"{privs} em {alvo}")
            continue
        objetos.add(alvo.split(".")[-1])
    saida = [_r(C1, "o usuário sistema_ia só tem privilégio SELECT (nenhum INSERT/UPDATE/DELETE/DDL/GRANT)", "só SELECT", not indevidos,
                "; ".join(indevidos) or f"{len(concessoes)} concessão(ões)")]
    faltam, sobram = sorted(set(VIEWS) - objetos), sorted(objetos - set(VIEWS))
    saida.append(_r(C1, "o SELECT vale exatamente para as 15 views do esquema (nem mais, nem menos)", "15 views", not faltam and not sobram,
                    ("sem permissão em: " + ", ".join(faltam) + ". " if faltam else "") + ("permissão além das views: " + ", ".join(sobram) if sobram else "") or f"{len(objetos)} views"))
    return saida


def _verificar_banco() -> List[Dict[str, Any]]:
    saida = []
    try:
        saida += _usuario_e_privilegios()
    except Exception as e:
        saida.append(_r(C1, "ler os privilégios do usuário sistema_ia", "SHOW GRANTS", False, f"{type(e).__name__}: {str(e)[:100]}"))
    eng = executor.obter_engine()
    for desc, sql in TENTATIVAS_NO_BANCO:
        try:
            with eng.connect() as con:
                con.execution_options(isolation_level="AUTOCOMMIT").execute(text(sql))
            saida.append(_r(C1, f"{desc} ({sql[:55]})", "bloqueado pelo banco", False, "O BANCO EXECUTOU! Revise os GRANTs do sistema_ia."))
        except DBAPIError as e:
            codigo = e.orig.args[0] if getattr(e.orig, "args", None) and isinstance(e.orig.args[0], int) else None
            saida.append(_r(C1, f"{desc} ({sql[:55]})", "bloqueado pelo banco", codigo in _ERROS_DE_PRIVILEGIO,
                            f"recusado (código {codigo})", incerto=codigo not in _ERROS_DE_PRIVILEGIO))
    for sql in _LIMPEZA:   # se algum privilégio indevido deixou lixo, tenta remover
        try:
            with eng.connect() as con:
                con.execution_options(isolation_level="AUTOCOMMIT").execute(text(sql))
        except Exception:
            pass
    try:
        with eng.connect() as con:
            n = con.execute(text("SELECT COUNT(*) FROM v_produtos")).scalar()
        saida.append(_r(C1, "uso legítimo: ler uma view", "permitido", True, f"{n} linha(s)"))
    except Exception as e:
        saida.append(_r(C1, "uso legítimo: ler uma view", "permitido", False, f"{type(e).__name__}: {str(e)[:100]}"))
    return saida


def _verificar_views() -> List[Dict[str, Any]]:
    from database import SessionLocal
    db = SessionLocal()
    try:
        linhas = db.execute(text("SELECT table_name, column_name FROM information_schema.columns "
                                 "WHERE table_schema = DATABASE() AND table_name LIKE 'v\\_%'")).fetchall()
    finally:
        db.close()
    no_banco: Dict[str, set] = {}
    for t, c in linhas:
        if t in VIEWS:
            no_banco.setdefault(str(t), set()).add(str(c))
    sensiveis = [f"{t}.{c}" for t, cs in no_banco.items() for c in cs if any(p in c.lower() for p in _COLUNAS_SENSIVEIS)]
    divergentes = [t for t in VIEWS if no_banco.get(t, set()) != {c.nome for c in VIEWS[t].colunas}]
    return [
        _r(C2, f"as {len(VIEWS)} views existem no banco", "todas", len(no_banco) == len(VIEWS), ", ".join(sorted(set(VIEWS) - set(no_banco))) or "ok"),
        _r(C2, "nenhuma coluna de documento, telefone, e-mail, endereço completo, senha, token ou foto", "nenhuma", not sensiveis, ", ".join(sensiveis) or "ok"),
        _r(C2, "colunas do banco = colunas documentadas para a IA (nada fica sem descrição)", "iguais", not divergentes, ", ".join(divergentes) or "ok"),
    ]


def _bloqueia_validador(sql: str) -> Tuple[bool, str]:
    try:
        sql_seguro.validar(sql, config.max_linhas())
    except ErroSql as e:
        return True, str(e)[:100]
    return False, "O VALIDADOR ACEITOU"


def _verificar_validador() -> List[Dict[str, Any]]:
    saida = []
    for desc, sql in ATAQUES_AO_VALIDADOR:
        bloqueou, det = _bloqueia_validador(sql)
        saida.append(_r(C3, f"{desc} ({sql[:55]})", "bloqueado", bloqueou, det))
    v = sql_seguro.validar("SELECT id FROM v_produtos", config.max_linhas())
    saida.append(_r(C5, "SELECT sem LIMIT recebe o LIMIT máximo", f"LIMIT {config.max_linhas() + 1}", v.sql.upper().rstrip().endswith(f"LIMIT {config.max_linhas() + 1}"), v.sql[-30:]))
    v = sql_seguro.validar("SELECT id FROM v_produtos LIMIT 100000", config.max_linhas())
    saida.append(_r(C5, "LIMIT 100000 pedido pela IA é reduzido ao máximo", f"LIMIT {config.max_linhas() + 1}", v.sql.upper().rstrip().endswith(f"LIMIT {config.max_linhas() + 1}"), v.sql[-30:]))
    return saida


def _verificar_escopo() -> List[Dict[str, Any]]:
    saida = []
    for desc, sql, perms in NEGADOS_PELO_ESCOPO:
        try:
            v = sql_seguro.validar(sql, config.max_linhas())
            escopo.verificar(v.views, set(perms))
            saida.append(_r(C4, desc, "negado", False, "O ESCOPO DEIXOU PASSAR"))
        except ErroEscopo as e:
            saida.append(_r(C4, desc, "negado", True, str(e)[:100]))
        except ErroSql as e:
            saida.append(_r(C4, desc, "negado", False, f"o validador recusou antes ({str(e)[:70]}); o teste não chegou ao escopo", incerto=True))
    for desc, sql, perms in PERMITIDOS:
        try:
            v = sql_seguro.validar(sql, config.max_linhas())
            escopo.verificar(v.views, set(perms))
            saida.append(_r(C4, desc, "permitido", True))
        except (ErroSql, ErroEscopo) as e:
            saida.append(_r(C4, desc, "permitido", False, f"recusou o uso legítimo: {str(e)[:90]}"))
    return saida


def _verificar_limites() -> List[Dict[str, Any]]:
    juncoes = " JOIN ".join(f"v_produtos p{i}" for i in range(10))
    inicio = time.monotonic()
    try:
        executor.executar(f"SELECT COUNT(*) FROM {juncoes}", config.max_linhas(), 1)
        gasto = time.monotonic() - inicio
        return [_r(C5, "consulta que não termina é interrompida no tempo máximo (teste com limite de 1 s)", "interrompida em ~1 s", False, f"TERMINOU em {gasto:.1f} s sem ser interrompida")]
    except ErroConsulta as e:
        gasto = time.monotonic() - inicio
        return [_r(C5, "consulta que não termina é interrompida no tempo máximo (teste com limite de 1 s)", "interrompida em ~1 s", gasto <= 8, f"interrompida em {gasto:.1f} s: {str(e)[:60]}")]
    except Exception as e:
        return [_r(C5, "consulta que não termina é interrompida no tempo máximo", "interrompida em ~1 s", False, f"{type(e).__name__}: {str(e)[:80]}")]


def executar_defesas() -> Dict[str, Any]:
    verificacoes: List[Dict[str, Any]] = []
    etapas: List[Callable[[], List[Dict[str, Any]]]] = [_verificar_banco, _verificar_views, _verificar_validador, _verificar_escopo, _verificar_limites]
    for etapa in etapas:
        try:
            verificacoes += etapa()
        except Exception as e:   # uma etapa quebrada não esconde as outras
            verificacoes.append(_r(etapa.__name__.replace("_verificar_", ""), "executar a etapa", "concluir", False, f"{type(e).__name__}: {str(e)[:100]}"))
    por_camada: Dict[str, Dict[str, int]] = {}
    for v in verificacoes:
        c = por_camada.setdefault(v["camada"], {"OK": 0, "FALHA": 0, "INCERTO": 0})
        c[v["resultado"]] += 1
    total = len(verificacoes)
    return {"resumo": {"total": total, "OK": sum(c["OK"] for c in por_camada.values()), "FALHA": sum(c["FALHA"] for c in por_camada.values()),
                       "INCERTO": sum(c["INCERTO"] for c in por_camada.values()), "por_camada": dict(sorted(por_camada.items()))},
            "verificacoes": verificacoes}
