"""relatorios financeiros: custo congelado e data de confirmacao da venda, indices por periodo

- pedido_venda.confirmado_em: data em que a venda se concretiza (receita pertence a esse dia)
- item_pedido_venda.custo_unitario: custo do produto no momento da confirmacao (base da margem)
- vendas ja confirmadas: confirmado_em = ultima alteracao do pedido; custo = preco_custo atual do produto
- indices (status, data) nos dois pedidos e data_pagamento na baixa, para as consultas por periodo

Revision ID: d3f7b2a9c5e1
Revises: c8e2a6d4f1b9
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = "d3f7b2a9c5e1"
down_revision = "c8e2a6d4f1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column("pedido_venda", sa.Column("confirmado_em", sa.DateTime(), nullable=True))
    op.add_column("item_pedido_venda", sa.Column("custo_unitario", sa.Numeric(12, 4), nullable=True))

    conn.execute(sa.text(
        "UPDATE pedido_venda SET confirmado_em = COALESCE(updated_at, data_pedido) WHERE status = 'confirmado'"
    ))
    conn.execute(sa.text(
        "UPDATE item_pedido_venda i "
        "JOIN pedido_venda p ON p.id = i.pedido_venda_id "
        "JOIN produto pr ON pr.id = i.produto_id "
        "SET i.custo_unitario = COALESCE(pr.preco_custo, 0) "
        "WHERE p.status = 'confirmado'"
    ))

    op.create_index("ix_pedido_venda_status_data", "pedido_venda", ["status", "data_pedido"])
    op.create_index("ix_pedido_compra_status_data", "pedido_compra", ["status", "data_pedido"])
    op.create_index("ix_baixa_titulo_data_pagamento", "baixa_titulo", ["data_pagamento"])


def downgrade() -> None:
    op.drop_index("ix_baixa_titulo_data_pagamento", table_name="baixa_titulo")
    op.drop_index("ix_pedido_compra_status_data", table_name="pedido_compra")
    op.drop_index("ix_pedido_venda_status_data", table_name="pedido_venda")
    op.drop_column("item_pedido_venda", "custo_unitario")
    op.drop_column("pedido_venda", "confirmado_em")
