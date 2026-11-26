"""permissões por cadastro: 'cadastros.editar' vira 7 módulos com ver/editar (só dados)

Revision ID: f8a3c6e1d2b4
Revises: e5b9c2d7f3a1
Create Date: 2026-11-25

Antes: um único código 'cadastros.editar' e leitura livre dos cadastros para qualquer usuário logado.
Agora: produtos, categorias, subcategorias, unidades, clientes, fornecedores e formas_pagamento, cada um com
'ver' e 'editar' (o catálogo passa de 15 para 28 permissões). Ninguém perde nem ganha acesso na migração:
- TODOS os grupos (e quem tinha permissões extras) recebem os 7 '.ver' (antes a leitura era livre para todos);
- quem tinha 'cadastros.editar' (no grupo ou como extra) recebe os 7 '.editar';
- 'cadastros.editar' é removido do catálogo.
Depois, o administrador restringe cada grupo na tela de Grupos de Acesso.
"""
import sqlalchemy as sa
from alembic import op

revision = "f8a3c6e1d2b4"
down_revision = "e5b9c2d7f3a1"
branch_labels = None
depends_on = None

ANTIGO = "cadastros.editar"
CADASTROS = {
    "produtos":         "Cadastro de produtos e insumos (estoque, preços e embalagem)",
    "categorias":       "Cadastro de categorias de produto",
    "subcategorias":    "Cadastro de subcategorias de produto",
    "unidades":         "Cadastro de unidades de medida",
    "clientes":         "Cadastro de clientes e seus endereços",
    "fornecedores":     "Cadastro de fornecedores e seus endereços",
    "formas_pagamento": "Cadastro de formas de pagamento e parcelas",
}
ROTULO = {"ver": "Visualizar", "editar": "Criar e alterar"}


def _id(conn, codigo):
    return conn.execute(sa.text("SELECT id FROM permissao WHERE codigo = :c"), {"c": codigo}).scalar()


def upgrade() -> None:
    conn = op.get_bind()
    novos = {}
    for modulo, desc in CADASTROS.items():
        for acao in ("ver", "editar"):
            codigo = f"{modulo}.{acao}"
            if _id(conn, codigo) is None:
                conn.execute(sa.text("INSERT INTO permissao (codigo, modulo, acao, descricao) VALUES (:c, :m, :a, :d)"),
                             {"c": codigo, "m": modulo, "a": acao, "d": f"{ROTULO[acao]} — {desc}"})
            novos[codigo] = _id(conn, codigo)
    ver = [novos[f"{m}.ver"] for m in CADASTROS]
    editar = [novos[f"{m}.editar"] for m in CADASTROS]
    antigo = _id(conn, ANTIGO)

    grupos = [g for (g,) in conn.execute(sa.text("SELECT id FROM grupo_acesso"))]
    grupos_editar = set()
    usuarios_editar = set()
    if antigo is not None:
        grupos_editar = {g for (g,) in conn.execute(sa.text("SELECT grupo_id FROM grupo_permissao WHERE permissao_id = :p"), {"p": antigo})}
        usuarios_editar = {u for (u,) in conn.execute(sa.text("SELECT usuario_id FROM usuario_permissao WHERE permissao_id = :p"), {"p": antigo})}

    def dar(tabela, coluna, dono, pids):
        for pid in pids:
            existe = conn.execute(sa.text(f"SELECT 1 FROM {tabela} WHERE {coluna} = :d AND permissao_id = :p"), {"d": dono, "p": pid}).first()
            if not existe:
                conn.execute(sa.text(f"INSERT INTO {tabela} ({coluna}, permissao_id) VALUES (:d, :p)"), {"d": dono, "p": pid})

    for g in grupos:   # a leitura era livre para todos: todos os grupos continuam vendo os cadastros
        dar("grupo_permissao", "grupo_id", g, ver)
    for g in grupos_editar:
        dar("grupo_permissao", "grupo_id", g, editar)
    for u in usuarios_editar:   # extra individual: o "editar" já inclui o "ver"
        dar("usuario_permissao", "usuario_id", u, editar)

    if antigo is not None:
        conn.execute(sa.text("DELETE FROM usuario_permissao WHERE permissao_id = :p"), {"p": antigo})
        conn.execute(sa.text("DELETE FROM grupo_permissao WHERE permissao_id = :p"), {"p": antigo})
        conn.execute(sa.text("DELETE FROM permissao WHERE id = :p"), {"p": antigo})


def downgrade() -> None:
    conn = op.get_bind()
    if _id(conn, ANTIGO) is None:
        conn.execute(sa.text("INSERT INTO permissao (codigo, modulo, acao, descricao) VALUES (:c, 'cadastros', 'editar', :d)"),
                     {"c": ANTIGO, "d": "Criar e alterar — Cadastros: produtos, categorias, subcategorias, unidades de medida, "
                                        "clientes, fornecedores e formas de pagamento"})
    antigo = _id(conn, ANTIGO)
    editar = [i for i in (_id(conn, f"{m}.editar") for m in CADASTROS) if i]
    todos = [i for i in (_id(conn, f"{m}.{a}") for m in CADASTROS for a in ("ver", "editar")) if i]
    lista = ", ".join(str(i) for i in editar) or "0"
    # quem editava algum cadastro volta a ter cadastros.editar
    for tabela, coluna in (("grupo_permissao", "grupo_id"), ("usuario_permissao", "usuario_id")):
        donos = {d for (d,) in conn.execute(sa.text(f"SELECT DISTINCT {coluna} FROM {tabela} WHERE permissao_id IN ({lista})"))}
        for d in donos:
            conn.execute(sa.text(f"INSERT INTO {tabela} ({coluna}, permissao_id) VALUES (:d, :p)"), {"d": d, "p": antigo})
    lista_todos = ", ".join(str(i) for i in todos) or "0"
    conn.execute(sa.text(f"DELETE FROM usuario_permissao WHERE permissao_id IN ({lista_todos})"))
    conn.execute(sa.text(f"DELETE FROM grupo_permissao WHERE permissao_id IN ({lista_todos})"))
    conn.execute(sa.text(f"DELETE FROM permissao WHERE id IN ({lista_todos})"))
