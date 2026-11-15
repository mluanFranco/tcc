"""manutenção de geladeira com forma de pagamento (parcelas)

Revision ID: d2a6f1c8e4b3
Revises: c7f3a9e2d1b8
Create Date: 2026-11-14

- historico_manutencao.forma_pagamento_id (FK, opcional): com custo, as parcelas da forma viram as contas a pagar,
  com os prazos contados a partir da data da manutenção (como nos pedidos de compra).
- titulo_financeiro: a trava "1 título por manutenção" vira "1 título por parcela da manutenção".
- As manutenções antigas não mudam: continuam com 1 título e vencimento informado, sem forma de pagamento.
"""
from alembic import op
import sqlalchemy as sa

revision = "d2a6f1c8e4b3"
down_revision = "c7f3a9e2d1b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("historico_manutencao", sa.Column("forma_pagamento_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_manutencao_forma_pagamento", "historico_manutencao", "forma_pagamento",
                          ["forma_pagamento_id"], ["id"])
    # A nova trava é criada ANTES de remover a antiga: a FK fk_titulo_manutencao precisa sempre de um índice
    op.create_unique_constraint("uq_titulo_manutencao_parcela", "titulo_financeiro", ["historico_manutencao_id", "numero_parcela"])
    op.drop_constraint("uq_titulo_manutencao", "titulo_financeiro", type_="unique")


def downgrade() -> None:
    # Só funciona se nenhuma manutenção tiver mais de uma parcela
    op.create_unique_constraint("uq_titulo_manutencao", "titulo_financeiro", ["historico_manutencao_id"])
    op.drop_constraint("uq_titulo_manutencao_parcela", "titulo_financeiro", type_="unique")
    op.drop_constraint("fk_manutencao_forma_pagamento", "historico_manutencao", type_="foreignkey")
    op.drop_column("historico_manutencao", "forma_pagamento_id")
