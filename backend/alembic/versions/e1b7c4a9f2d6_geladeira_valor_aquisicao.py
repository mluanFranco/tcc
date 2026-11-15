"""valor de aquisição da geladeira (patrimônio)

Revision ID: e1b7c4a9f2d6
Revises: d2a6f1c8e4b3
Create Date: 2026-11-14

- geladeira.valor_aquisicao (FLOAT, opcional): valor de compra do equipamento, usado no relatório de
  patrimônio (declaração de bens). Geladeiras antigas ficam sem valor até alguém preenchê-lo.
- v_geladeiras (assistente) passa a expor valor_aquisicao.
"""
from alembic import op
import sqlalchemy as sa

revision = "e1b7c4a9f2d6"
down_revision = "d2a6f1c8e4b3"
branch_labels = None
depends_on = None

_BASE = """
SELECT g.id, g.tipo, g.modelo, g.marca, g.numero_serie, g.data_alocacao, g.status,
       g.cliente_id, c.nome AS cliente, e.cidade AS cidade, e.uf AS uf{extra}
FROM geladeira g
JOIN cliente c ON c.id = g.cliente_id
LEFT JOIN cliente_endereco e ON e.id = g.endereco_id"""
_V_NOVA = _BASE.format(extra=",\n       CAST(g.valor_aquisicao AS DECIMAL(14,2)) AS valor_aquisicao")
_V_ANTIGA = _BASE.format(extra="")


def upgrade() -> None:
    op.add_column("geladeira", sa.Column("valor_aquisicao", sa.Float(), nullable=True))
    # CREATE OR REPLACE mantém os GRANTs do usuário da IA (e o preparar_banco.py os reaplica ao subir o container)
    op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_geladeiras AS {_V_NOVA}")


def downgrade() -> None:
    op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_geladeiras AS {_V_ANTIGA}")
    op.drop_column("geladeira", "valor_aquisicao")
