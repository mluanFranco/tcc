"""financeiro: categorias e lancamentos avulsos

- categoria_financeira (pagar | receber); as categorias 'sistema' (Vendas e Compra de insumos) sao usadas
  pelos titulos que nascem de pedidos e nao podem ser renomeadas nem desativadas
- titulo_financeiro ganha categoria_id (obrigatoria) e descricao (obrigatoria quando nao ha pedido)
- os titulos que ja existem recebem a categoria 'sistema' do seu tipo

Revision ID: c8e2a6d4f1b9
Revises: b5c1e8f2a7d3
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = "c8e2a6d4f1b9"
down_revision = "b5c1e8f2a7d3"
branch_labels = None
depends_on = None

CHECK_AVULSO = "pedido_venda_id IS NOT NULL OR pedido_compra_id IS NOT NULL OR descricao IS NOT NULL"

CATEGORIAS_INICIAIS = [
    # (nome, tipo, sistema)
    ("Vendas", "receber", 1),
    ("Outras receitas", "receber", 0),
    ("Compra de insumos", "pagar", 1),
    ("Aluguel", "pagar", 0),
    ("Energia e água", "pagar", 0),
    ("Folha de pagamento", "pagar", 0),
    ("Impostos", "pagar", 0),
    ("Manutenção", "pagar", 0),
    ("Outras despesas", "pagar", 0),
]


def upgrade() -> None:
    conn = op.get_bind()

    op.create_table(
        "categoria_financeira",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(length=100), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("sistema", sa.Boolean(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("nome", "tipo", name="uq_categoria_financeira_nome_tipo"),
    )
    for nome, tipo, sistema in CATEGORIAS_INICIAIS:
        conn.execute(
            sa.text("INSERT INTO categoria_financeira (nome, tipo, sistema, ativo) VALUES (:n, :t, :s, 1)"),
            {"n": nome, "t": tipo, "s": sistema},
        )

    op.add_column("titulo_financeiro", sa.Column("categoria_id", sa.Integer(), nullable=True))
    op.add_column("titulo_financeiro", sa.Column("descricao", sa.String(length=255), nullable=True))
    conn.execute(sa.text(
        "UPDATE titulo_financeiro t JOIN categoria_financeira c ON c.sistema = 1 AND c.tipo = t.tipo "
        "SET t.categoria_id = c.id"
    ))
    op.alter_column("titulo_financeiro", "categoria_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_titulo_categoria", "titulo_financeiro", "categoria_financeira", ["categoria_id"], ["id"])
    op.create_check_constraint("ck_titulo_avulso_descricao", "titulo_financeiro", CHECK_AVULSO)


def downgrade() -> None:
    # lancamentos avulsos nao existiam antes: saem junto (com as baixas deles)
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM baixa_titulo WHERE titulo_id IN "
        "(SELECT id FROM titulo_financeiro WHERE pedido_venda_id IS NULL AND pedido_compra_id IS NULL)"
    ))
    conn.execute(sa.text("DELETE FROM titulo_financeiro WHERE pedido_venda_id IS NULL AND pedido_compra_id IS NULL"))

    op.drop_constraint("ck_titulo_avulso_descricao", "titulo_financeiro", type_="check")
    op.drop_constraint("fk_titulo_categoria", "titulo_financeiro", type_="foreignkey")
    op.drop_column("titulo_financeiro", "descricao")
    op.drop_column("titulo_financeiro", "categoria_id")
    op.drop_table("categoria_financeira")
