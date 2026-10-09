"""ordem_producao e ordem_producao_item

Revision ID: e7a2c9d4b1f3
Revises: d1f6b3a8e2c5
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "e7a2c9d4b1f3"
down_revision = "d1f6b3a8e2c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ordem_producao",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("receita_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("observacao", sa.String(length=255), nullable=True),
        sa.Column("custo_total", sa.Float(), nullable=True),
        sa.Column("custo_unitario", sa.Float(), nullable=True),
        sa.Column("confirmada_em", sa.DateTime(), nullable=True),
        sa.Column("cancelada_em", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["receita_id"], ["receita.id"]),
        sa.ForeignKeyConstraint(["produto_id"], ["produto.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ordem_producao_item",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ordem_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.Column("custo_unitario", sa.Float(), nullable=False),
        sa.Column("subtotal", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["ordem_id"], ["ordem_producao.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["produto_id"], ["produto.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ordem_producao_item")
    op.drop_table("ordem_producao")
