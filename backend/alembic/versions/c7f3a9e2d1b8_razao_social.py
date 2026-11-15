"""razão social em cliente e fornecedor

Revision ID: c7f3a9e2d1b8
Revises: b5e2d8f4a6c1
Create Date: 2026-11-12

- cliente.razao_social e fornecedor.razao_social (VARCHAR(150), opcionais no banco).
- O `nome` continua sendo o nome usado nas telas: nome fantasia (PJ) ou nome completo (PF).
- A obrigatoriedade (cliente PJ e fornecedor) é regra da API no cadastro: registros antigos ficam sem razão social até
  alguém preenchê-la. As views do assistente não mudam.
"""
from alembic import op
import sqlalchemy as sa

revision = "c7f3a9e2d1b8"
down_revision = "b5e2d8f4a6c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cliente", sa.Column("razao_social", sa.String(150), nullable=True))
    op.add_column("fornecedor", sa.Column("razao_social", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("fornecedor", "razao_social")
    op.drop_column("cliente", "razao_social")
