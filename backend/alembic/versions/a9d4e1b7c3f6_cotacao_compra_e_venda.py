"""cotacao unificada (compra e venda) com vinculo ao pedido gerado

- cotacao ganha: tipo, cliente_id, forma_pagamento_id, validade, pedido_venda_id,
  pedido_compra_id, updated_at; fornecedor_id passa a aceitar nulo
- CHECK: compra tem fornecedor e nao tem cliente; venda tem cliente e nao tem fornecedor
- item_cotacao: quantidade_referencia vira quantidade (obrigatoria) e ganha desconto
- as cotacoes existentes viram tipo 'compra' (todas tinham fornecedor)

Revision ID: a9d4e1b7c3f6
Revises: f3b8d6a1c9e4
Create Date: 2026-10-11
"""
from alembic import op
import sqlalchemy as sa

revision = "a9d4e1b7c3f6"
down_revision = "f3b8d6a1c9e4"
branch_labels = None
depends_on = None

CHECK_TIPO_PARTE = (
    "(tipo = 'compra' AND fornecedor_id IS NOT NULL AND cliente_id IS NULL) OR "
    "(tipo = 'venda' AND cliente_id IS NOT NULL AND fornecedor_id IS NULL)"
)


def upgrade() -> None:
    conn = op.get_bind()

    # cotacao
    op.add_column("cotacao", sa.Column("tipo", sa.String(length=10), nullable=False, server_default="compra"))
    op.alter_column("cotacao", "tipo", existing_type=sa.String(length=10), existing_nullable=False, server_default=None)
    op.alter_column("cotacao", "fornecedor_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("cotacao", sa.Column("cliente_id", sa.Integer(), nullable=True))
    op.add_column("cotacao", sa.Column("forma_pagamento_id", sa.Integer(), nullable=True))
    op.add_column("cotacao", sa.Column("validade", sa.Date(), nullable=True))
    op.add_column("cotacao", sa.Column("pedido_venda_id", sa.Integer(), nullable=True))
    op.add_column("cotacao", sa.Column("pedido_compra_id", sa.Integer(), nullable=True))
    op.add_column("cotacao", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_cotacao_cliente", "cotacao", "cliente", ["cliente_id"], ["id"])
    op.create_foreign_key("fk_cotacao_forma_pagamento", "cotacao", "forma_pagamento", ["forma_pagamento_id"], ["id"])
    op.create_foreign_key("fk_cotacao_pedido_venda", "cotacao", "pedido_venda", ["pedido_venda_id"], ["id"])
    op.create_foreign_key("fk_cotacao_pedido_compra", "cotacao", "pedido_compra", ["pedido_compra_id"], ["id"])
    conn.execute(sa.text("UPDATE cotacao SET updated_at = COALESCE(created_at, data_cotacao, NOW())"))
    op.create_check_constraint("ck_cotacao_tipo_parte", "cotacao", CHECK_TIPO_PARTE)

    # item_cotacao
    conn.execute(sa.text("UPDATE item_cotacao SET quantidade_referencia = 1 WHERE quantidade_referencia IS NULL"))
    op.alter_column("item_cotacao", "quantidade_referencia", new_column_name="quantidade",
                    existing_type=sa.Numeric(12, 3), existing_nullable=True, nullable=False)
    op.add_column("item_cotacao", sa.Column("desconto", sa.Float(), nullable=False, server_default="0"))
    op.alter_column("item_cotacao", "desconto", existing_type=sa.Float(), existing_nullable=False, server_default=None)


def downgrade() -> None:
    conn = op.get_bind()

    # cotacoes de venda nao cabem no formato antigo (so fornecedor): saem junto
    conn.execute(sa.text("DELETE FROM item_cotacao WHERE cotacao_id IN (SELECT id FROM cotacao WHERE tipo = 'venda')"))
    conn.execute(sa.text("DELETE FROM cotacao WHERE tipo = 'venda'"))

    op.drop_column("item_cotacao", "desconto")
    op.alter_column("item_cotacao", "quantidade", new_column_name="quantidade_referencia",
                    existing_type=sa.Numeric(12, 3), existing_nullable=False, nullable=True)

    op.drop_constraint("ck_cotacao_tipo_parte", "cotacao", type_="check")
    op.drop_constraint("fk_cotacao_pedido_compra", "cotacao", type_="foreignkey")
    op.drop_constraint("fk_cotacao_pedido_venda", "cotacao", type_="foreignkey")
    op.drop_constraint("fk_cotacao_forma_pagamento", "cotacao", type_="foreignkey")
    op.drop_constraint("fk_cotacao_cliente", "cotacao", type_="foreignkey")
    op.drop_column("cotacao", "updated_at")
    op.drop_column("cotacao", "pedido_compra_id")
    op.drop_column("cotacao", "pedido_venda_id")
    op.drop_column("cotacao", "validade")
    op.drop_column("cotacao", "forma_pagamento_id")
    op.drop_column("cotacao", "cliente_id")
    op.alter_column("cotacao", "fornecedor_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("cotacao", "tipo")
