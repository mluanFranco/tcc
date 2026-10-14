"""grupos de acesso, permissoes por grupo e por usuario, foto do usuario

- permissao: catalogo fixo "<modulo>.<ver|editar>" (14 permissoes)
- grupo_acesso, grupo_permissao: grupos e o que cada um pode
- usuario_permissao: permissoes extras de um usuario especifico (so concedem)
- usuario.grupo_id (um grupo por usuario) e usuario.foto (nome do arquivo em uploads/usuarios/)
- grupos padrao: Gerencia (tudo), Operacional (sem financeiro e relatorios) e Consulta (so leitura operacional)
- usuarios ja existentes que nao sao admin entram no grupo Operacional (admin continua com tudo, sem grupo)

Revision ID: e4a9c7d1b3f6
Revises: d3f7b2a9c5e1
Create Date: 2026-10-14
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "e4a9c7d1b3f6"
down_revision = "d3f7b2a9c5e1"
branch_labels = None
depends_on = None

# O catalogo fica copiado aqui de proposito: a migration nao pode mudar se o codigo mudar depois.
_MODULOS = [
    ("cadastros",  "Cadastros: produtos, categorias, subcategorias, unidades de medida, clientes, fornecedores e formas de pagamento", ["editar"]),
    ("geladeiras", "Geladeiras e histórico de manutenção", ["ver", "editar"]),
    ("vendas",     "Pedidos de venda (e o PDF do pedido)", ["ver", "editar"]),
    ("compras",    "Pedidos de compra (e o PDF do pedido)", ["ver", "editar"]),
    ("cotacoes",   "Cotações de compra e de venda (e o PDF da cotação)", ["ver", "editar"]),
    ("producao",   "Receitas e ordens de produção", ["ver", "editar"]),
    ("financeiro", "Financeiro: títulos a pagar e a receber, baixas e categorias financeiras", ["ver", "editar"]),
    ("relatorios", "Relatórios financeiros por período", ["ver"]),
]
_ROTULO = {"ver": "Visualizar", "editar": "Criar e alterar"}
_TODAS = [f"{m}.{a}" for m, _, acoes in _MODULOS for a in acoes]
_OPERACIONAIS = ["geladeiras", "vendas", "compras", "cotacoes", "producao"]
_GRUPOS = [
    ("Gerência", "Acesso a todos os módulos, inclusive financeiro e relatórios", list(_TODAS)),
    ("Operacional", "Cadastros, geladeiras, vendas, compras, cotações e produção; sem financeiro e relatórios",
     ["cadastros.editar"] + [f"{m}.editar" for m in _OPERACIONAIS]),
    ("Consulta", "Somente visualização dos módulos operacionais; sem financeiro e relatórios",
     [f"{m}.ver" for m in _OPERACIONAIS]),
]


def upgrade() -> None:
    conn = op.get_bind()

    permissao = op.create_table(
        "permissao",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo", sa.String(length=40), nullable=False),
        sa.Column("modulo", sa.String(length=30), nullable=False),
        sa.Column("acao", sa.String(length=10), nullable=False),
        sa.Column("descricao", sa.String(length=200), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo"),
    )
    grupo = op.create_table(
        "grupo_acesso",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("descricao", sa.String(length=255), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nome"),
    )
    op.create_table(
        "grupo_permissao",
        sa.Column("grupo_id", sa.Integer(), nullable=False),
        sa.Column("permissao_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["grupo_id"], ["grupo_acesso.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permissao_id"], ["permissao.id"]),
        sa.PrimaryKeyConstraint("grupo_id", "permissao_id"),
    )

    op.add_column("usuario", sa.Column("grupo_id", sa.Integer(), nullable=True))
    op.add_column("usuario", sa.Column("foto", sa.String(length=80), nullable=True))
    op.create_index("ix_usuario_grupo_id", "usuario", ["grupo_id"])
    op.create_foreign_key("fk_usuario_grupo_acesso", "usuario", "grupo_acesso", ["grupo_id"], ["id"])

    op.create_table(
        "usuario_permissao",
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("permissao_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permissao_id"], ["permissao.id"]),
        sa.PrimaryKeyConstraint("usuario_id", "permissao_id"),
    )

    # catalogo
    op.bulk_insert(permissao, [
        {"codigo": f"{m}.{a}", "modulo": m, "acao": a, "descricao": f"{_ROTULO[a]} — {desc}"}
        for m, desc, acoes in _MODULOS for a in acoes
    ])
    ids = {codigo: i for i, codigo in conn.execute(sa.text("SELECT id, codigo FROM permissao"))}

    # grupos padrao
    agora = datetime.now()
    op.bulk_insert(grupo, [
        {"nome": nome, "descricao": desc, "ativo": True, "created_at": agora, "updated_at": agora}
        for nome, desc, _ in _GRUPOS
    ])
    grupo_ids = {nome: i for i, nome in conn.execute(sa.text("SELECT id, nome FROM grupo_acesso"))}
    gp = sa.table("grupo_permissao", sa.column("grupo_id", sa.Integer), sa.column("permissao_id", sa.Integer))
    op.bulk_insert(gp, [
        {"grupo_id": grupo_ids[nome], "permissao_id": ids[c]} for nome, _, codigos in _GRUPOS for c in codigos
    ])

    # quem ja existe e nao e admin continua operando, so que sem financeiro/relatorios (que passam a exigir permissao)
    conn.execute(
        sa.text("UPDATE usuario SET grupo_id = :g WHERE admin IS NULL OR admin = 0"),
        {"g": grupo_ids["Operacional"]},
    )


def downgrade() -> None:
    op.drop_table("usuario_permissao")
    op.drop_constraint("fk_usuario_grupo_acesso", "usuario", type_="foreignkey")
    op.drop_index("ix_usuario_grupo_id", table_name="usuario")
    op.drop_column("usuario", "foto")
    op.drop_column("usuario", "grupo_id")
    op.drop_table("grupo_permissao")
    op.drop_table("grupo_acesso")
    op.drop_table("permissao")
