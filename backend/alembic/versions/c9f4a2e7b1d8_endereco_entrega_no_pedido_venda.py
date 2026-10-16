"""endereço de entrega no pedido de venda

Revision ID: c9f4a2e7b1d8
Revises: b6e1a9d3c7f2
Create Date: 2026-10-16

- pedido_venda.endereco_entrega_id (opcional): endereço do próprio cliente onde o pedido será entregue.
  Nulo significa retirada. Pedidos antigos ficam sem endereço de entrega.
"""
from alembic import op
import sqlalchemy as sa

revision = "c9f4a2e7b1d8"
down_revision = "b6e1a9d3c7f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pedido_venda", sa.Column("endereco_entrega_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_pedido_venda_endereco_entrega", "pedido_venda", "cliente_endereco", ["endereco_entrega_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_pedido_venda_endereco_entrega", "pedido_venda", type_="foreignkey")
    op.drop_column("pedido_venda", "endereco_entrega_id")
