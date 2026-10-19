"""endereço de entrega (venda) e entrega prevista (compra) na cotação

Revision ID: a8d2f5c1b7e3
Revises: c9f4a2e7b1d8
Create Date: 2026-10-18

- cotacao.endereco_entrega_id (opcional): endereço do próprio cliente; nulo = retirada. Só cotação de venda.
- cotacao.data_entrega_prevista (opcional): só cotação de compra.
Os dois passam para o pedido gerado na aprovação. Cotações antigas ficam sem esses dados.
"""
from alembic import op
import sqlalchemy as sa

revision = "a8d2f5c1b7e3"
down_revision = "c9f4a2e7b1d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cotacao", sa.Column("data_entrega_prevista", sa.Date(), nullable=True))
    op.add_column("cotacao", sa.Column("endereco_entrega_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_cotacao_endereco_entrega", "cotacao", "cliente_endereco", ["endereco_entrega_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_cotacao_endereco_entrega", "cotacao", type_="foreignkey")
    op.drop_column("cotacao", "endereco_entrega_id")
    op.drop_column("cotacao", "data_entrega_prevista")
