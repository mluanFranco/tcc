"""quantidades decimais (Numeric 12,3) em estoque, pedidos e cotacao

Revision ID: c4a8f2d19b6e
Revises: b7e3d1a9c4f2
Create Date: 2026-10-08 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a8f2d19b6e'
down_revision: Union[str, Sequence[str], None] = 'b7e3d1a9c4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


QTD = sa.Numeric(12, 3)

COLUNAS = [
    ('produto', 'estoque_atual'),
    ('produto', 'estoque_minimo'),
    ('produto', 'estoque_reservado'),
    ('item_pedido_venda', 'quantidade'),
    ('item_pedido_compra', 'quantidade'),
    ('item_pedido_compra', 'quantidade_recebida'),
    ('item_cotacao', 'quantidade_referencia'),
]


def _alterar(tabela: str, coluna: str, de, para) -> None:
    # O MySQL redefine a coluna inteira no ALTER; por isso lemos do próprio banco
    # se ela aceita NULL e se tem valor padrão, para não alterar essas características.
    conn = op.get_bind()
    info = next(c for c in sa.inspect(conn).get_columns(tabela) if c['name'] == coluna)
    op.alter_column(
        tabela, coluna,
        existing_type=de,
        type_=para,
        existing_nullable=info['nullable'],
        existing_server_default=info['default'],
    )


def upgrade() -> None:
    """Upgrade schema."""
    for tabela, coluna in COLUNAS:
        _alterar(tabela, coluna, sa.Integer(), QTD)


def downgrade() -> None:
    """Downgrade schema."""
    # Atenção: quantidades fracionadas serão arredondadas para número inteiro.
    for tabela, coluna in COLUNAS:
        _alterar(tabela, coluna, QTD, sa.Integer())