"""receita e receita_item

Revision ID: d1f6b3a8e2c5
Revises: c4a8f2d19b6e
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "d1f6b3a8e2c5"
down_revision = "c4a8f2d19b6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receita",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("rendimento", sa.Numeric(12, 3), nullable=False),
        sa.Column("observacao", sa.String(length=255), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["produto_id"], ["produto.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("produto_id"),
    )
    op.create_table(
        "receita_item",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("receita_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(12, 3), nullable=False),
        sa.ForeignKeyConstraint(["receita_id"], ["receita.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["produto_id"], ["produto.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receita_id", "produto_id", name="uq_receita_item_receita_produto"),
    )


def downgrade() -> None:
    op.drop_table("receita_item")
    op.drop_table("receita")
