"""Validador do SQL gerado pela IA. Defesa nº 3 de 4 (as outras: usuário MySQL somente-leitura restrito às views,
views sem dados pessoais e escopo por permissão).

Política: lista de permissões (whitelist), não de bloqueios. Só passa:
- UMA instrução SELECT (com CTEs, subconsultas, UNION/INTERSECT/EXCEPT, funções de janela);
- tabelas = as views do esquema (ou apelidos CTE criados na própria consulta), sem prefixo de banco;
- funções conhecidas e inofensivas (nada de SLEEP, LOAD_FILE, GET_LOCK, BENCHMARK, USER, DATABASE...);
- sem comentários, variáveis, parâmetros, INTO, FOR UPDATE/LOCK, CROSS/NATURAL/vírgula em JOIN, WITH RECURSIVE.
O SQL que será executado é o REGERADO a partir da árvore (AST), nunca o texto original: o que não foi
entendido pelo parser não chega ao banco. O LIMIT é forçado em max_linhas + 1 (o +1 permite saber se houve corte).
"""
import re
from dataclasses import dataclass
from typing import FrozenSet, Set

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError

from core.assistente.esquema import NOMES_VIEWS, nomes_de_tabelas_conhecidas

MAX_CARACTERES = 4000
MAX_PROFUNDIDADE = 6   # subconsultas aninhadas

FUNCOES_PERMITIDAS: FrozenSet[str] = frozenset("""
SUM AVG MIN MAX COUNT ROUND CEIL CEILING FLOOR ABS MOD POWER POW SQRT TRUNCATE SIGN
COALESCE IFNULL NULLIF IF CASE GREATEST LEAST CAST CONVERT
UPPER LOWER TRIM LTRIM RTRIM LENGTH CHAR_LENGTH CONCAT CONCAT_WS SUBSTRING SUBSTR LEFT RIGHT REPLACE LPAD RPAD REVERSE
DATE YEAR MONTH DAY DAYOFMONTH DAYOFWEEK DAYOFYEAR WEEK WEEKOFYEAR QUARTER HOUR MINUTE SECOND MONTHNAME DAYNAME
DATE_FORMAT DATE_ADD DATE_SUB ADDDATE SUBDATE DATEDIFF TIMESTAMPDIFF LAST_DAY EXTRACT STR_TO_DATE FROM_DAYS TO_DAYS
CURRENT_DATE CURDATE CURRENT_TIMESTAMP NOW CURRENT_TIME CURTIME LOCALTIME LOCALTIMESTAMP
ROW_NUMBER RANK DENSE_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE PERCENT_RANK CUME_DIST
STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP
EXISTS ANY ALL IN
""".split())

# nós que nunca podem aparecer, mesmo que o parser os aceite
_PROIBIDOS = (
    exp.Into, exp.Lock, exp.Command, exp.Insert, exp.Update, exp.Delete, exp.Create, exp.Drop, exp.Alter,
    exp.Set, exp.Use, exp.Parameter, exp.SessionParameter, exp.Placeholder, exp.Merge, exp.Pragma,
    exp.Describe, exp.Commit, exp.Rollback, exp.Transaction, exp.LoadData, exp.Kill, exp.Show,
)


class ErroSql(ValueError):
    """SQL rejeitado. A mensagem é amigável e pode ser devolvida à IA para ela corrigir a consulta."""


@dataclass(frozen=True)
class SqlValidado:
    sql: str                 # SQL regerado, com LIMIT forçado, pronto para executar
    views: FrozenSet[str]    # views realmente usadas (base do controle por permissão)
    ctes: FrozenSet[str]


def _profundidade(no: exp.Expression) -> int:
    pior = 0

    def desce(n, nivel):
        nonlocal pior
        if isinstance(n, (exp.Subquery, exp.Select)):
            nivel += 1
            pior = max(pior, nivel)
        for filho in n.iter_expressions():
            desce(filho, nivel)
    desce(no, 0)
    return pior


_OPERADORES = (exp.Connector, exp.Binary, exp.Unary, exp.Paren)


def _nome_funcao(no: exp.Func) -> str:
    """Nome da função como o MySQL a receberá (o parser traduz alguns nomes: DATE_FORMAT vira TIME_TO_STR por dentro)."""
    if isinstance(no, exp.Anonymous):
        return str(no.name).upper()
    m = re.match(r"\s*([A-Za-z_][A-Za-z_0-9]*)\s*\(", no.sql(dialect="mysql"))
    return (m.group(1) if m else no.sql_name()).upper()


def validar(sql: str, max_linhas: int) -> SqlValidado:
    if not isinstance(sql, str) or not sql.strip():
        raise ErroSql("A consulta está vazia.")
    if len(sql) > MAX_CARACTERES:
        raise ErroSql(f"A consulta é grande demais (máximo de {MAX_CARACTERES} caracteres). Simplifique.")

    try:
        tokens = sqlglot.tokenize(sql, read="mysql")
        if any(t.comments for t in tokens):
            raise ErroSql("Comentários não são permitidos no SQL.")
        arvores = sqlglot.parse(sql, read="mysql")
    except ErroSql:
        raise
    except SqlglotError as e:
        raise ErroSql(f"SQL inválido para o MySQL: {str(e).splitlines()[0][:200]}")
    arvores = [a for a in arvores if a is not None]
    if len(arvores) != 1:
        raise ErroSql("Envie uma única instrução SELECT (sem ponto e vírgula separando várias).")
    raiz = arvores[0]

    if not isinstance(raiz, (exp.Select, exp.SetOperation)):
        raise ErroSql("Só é permitido SELECT (consulta de leitura).")

    for no in raiz.walk():
        if isinstance(no, _PROIBIDOS):
            raise ErroSql(f"Construção não permitida: {type(no).__name__.upper()}.")
        if getattr(no, "comments", None):
            raise ErroSql("Comentários não são permitidos no SQL.")

    if _profundidade(raiz) > MAX_PROFUNDIDADE:
        raise ErroSql("Subconsultas aninhadas demais. Simplifique (use WITH para organizar).")

    # CTEs: sem recursão e sem apelido igual ao de uma tabela/view real
    conhecidas = {n.lower() for n in nomes_de_tabelas_conhecidas()}
    ctes: Set[str] = set()
    for w in raiz.find_all(exp.With):
        if w.args.get("recursive"):
            raise ErroSql("WITH RECURSIVE não é permitido.")
    for c in raiz.find_all(exp.CTE):
        nome = c.alias_or_name
        if nome.lower() in conhecidas:
            raise ErroSql(f"O apelido '{nome}' não pode ter o nome de uma tabela ou view do sistema.")
        ctes.add(nome.lower())

    views: Set[str] = set()
    for t in raiz.find_all(exp.Table):
        if not isinstance(t.this, exp.Identifier):
            raise ErroSql("Funções de tabela não são permitidas no FROM.")
        if t.args.get("db") or t.args.get("catalog"):
            raise ErroSql("Não use prefixo de banco (schema.tabela). Use só o nome da view.")
        nome = t.name
        if nome.lower() in ctes:
            continue
        if nome not in NOMES_VIEWS:
            raise ErroSql(f"A tabela '{nome}' não existe para consulta. Use apenas as views do esquema fornecido.")
        views.add(nome)
    if not views:
        raise ErroSql("A consulta precisa ler pelo menos uma view do esquema.")

    for col in raiz.find_all(exp.Column):
        if col.args.get("db") or col.args.get("catalog"):
            raise ErroSql("Não use prefixo de banco nas colunas.")

    for j in raiz.find_all(exp.Join):
        kind = (j.args.get("kind") or "").upper()
        if kind == "CROSS" or j.args.get("method"):
            raise ErroSql("CROSS JOIN e NATURAL JOIN não são permitidos. Use JOIN ... ON.")
        if not j.args.get("on") and not j.args.get("using"):
            raise ErroSql("Todo JOIN precisa de ON (ou USING); evite listar tabelas separadas por vírgula.")

    for f in raiz.find_all(exp.Func):
        if isinstance(f, _OPERADORES):
            continue
        nome = _nome_funcao(f)
        if nome not in FUNCOES_PERMITIDAS:
            raise ErroSql(f"A função {nome} não é permitida.")

    # limite de linhas forçado
    teto = int(max_linhas) + 1
    atual = raiz.args.get("limit")
    valor = None
    if atual is not None and isinstance(atual.expression, exp.Literal) and not atual.expression.is_string:
        try:
            valor = int(atual.expression.name)
        except ValueError:
            valor = None
    if valor is None or valor > teto:
        raiz = raiz.limit(teto, copy=False)
    # OFFSET não é bloqueado: não aumenta o teto de linhas devolvidas.

    try:
        final = raiz.sql(dialect="mysql")
    except SqlglotError as e:  # pragma: no cover
        raise ErroSql(f"Não foi possível normalizar a consulta: {str(e)[:200]}")
    return SqlValidado(sql=final, views=frozenset(views), ctes=frozenset(ctes))
