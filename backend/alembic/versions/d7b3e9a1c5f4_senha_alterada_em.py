"""troca de senha pelo próprio usuário: usuario.senha_alterada_em

Revision ID: d7b3e9a1c5f4
Revises: a8d2f5c1b7e3
Create Date: 2026-10-20

- usuario.senha_alterada_em (opcional, UTC): quando a senha foi trocada pelo usuário ou redefinida por um administrador.
  O token JWT carrega o instante de emissão ("iat"); token emitido antes desse instante é recusado,
  então trocar a senha encerra as outras sessões abertas. Usuários que nunca trocaram ficam com NULL (nada muda para eles).
"""
from alembic import op
import sqlalchemy as sa

revision = "d7b3e9a1c5f4"
down_revision = "a8d2f5c1b7e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usuario", sa.Column("senha_alterada_em", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("usuario", "senha_alterada_em")
