"""assistente de IA: cotações separadas por tipo (v_cotacoes_compra e v_cotacoes_venda)

Revision ID: e5b9c2d7f3a1
Revises: d4f1a7c3e9b2
Create Date: 2026-11-25

A view única v_cotacao_itens (compra e venda juntas) exigia só cotacoes.ver, então quem tem acesso apenas a vendas
via cotações de compra pela IA. Ela é trocada por duas views:
- v_cotacoes_compra: exige cotacoes.ver + compras.ver (parte = fornecedor);
- v_cotacoes_venda:  exige cotacoes.ver + vendas.ver  (parte = cliente, com desconto).
As telas aplicam a mesma regra. O assistente passa a ter 16 views.
O GRANT do usuário sistema_ia nas views novas (e a retirada do GRANT da view apagada) é feito pelo
docker/preparar_banco.py, que roda como root logo depois das migrations.
"""
from alembic import op

revision = "e5b9c2d7f3a1"
down_revision = "d4f1a7c3e9b2"
branch_labels = None
depends_on = None

_D = "DECIMAL(14,2)"

V_COMPRA = f"""
CREATE VIEW v_cotacoes_compra AS
SELECT ct.id AS cotacao_id, ct.data_cotacao, ct.validade, ct.status,
       ct.fornecedor_id, f.nome AS fornecedor, i.produto_id, p.nome AS produto, i.quantidade, i.fator,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario,
       CASE WHEN i.preco_unitario IS NULL THEN NULL ELSE CAST(i.quantidade * i.preco_unitario AS {_D}) END AS subtotal
FROM item_cotacao i
JOIN cotacao ct ON ct.id = i.cotacao_id
JOIN produto p ON p.id = i.produto_id
JOIN fornecedor f ON f.id = ct.fornecedor_id
WHERE ct.tipo = 'compra'"""

V_VENDA = f"""
CREATE VIEW v_cotacoes_venda AS
SELECT ct.id AS cotacao_id, ct.data_cotacao, ct.validade, ct.status,
       ct.cliente_id, c.nome AS cliente, i.produto_id, p.nome AS produto, i.quantidade, i.fator,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CASE WHEN i.preco_unitario IS NULL THEN NULL
            ELSE CAST(i.quantidade * i.preco_unitario - COALESCE(i.desconto, 0) AS {_D}) END AS subtotal
FROM item_cotacao i
JOIN cotacao ct ON ct.id = i.cotacao_id
JOIN produto p ON p.id = i.produto_id
JOIN cliente c ON c.id = ct.cliente_id
WHERE ct.tipo = 'venda'"""

V_ANTIGA = f"""
CREATE VIEW v_cotacao_itens AS
SELECT ct.id AS cotacao_id, ct.tipo, ct.data_cotacao, ct.validade, ct.status,
       COALESCE(f.nome, c.nome) AS parte, i.produto_id, p.nome AS produto, i.quantidade, i.fator,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CASE WHEN i.preco_unitario IS NULL THEN NULL
            ELSE CAST(i.quantidade * i.preco_unitario - COALESCE(i.desconto, 0) AS {_D}) END AS subtotal
FROM item_cotacao i
JOIN cotacao ct ON ct.id = i.cotacao_id
JOIN produto p ON p.id = i.produto_id
LEFT JOIN fornecedor f ON f.id = ct.fornecedor_id
LEFT JOIN cliente c ON c.id = ct.cliente_id"""


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_cotacao_itens")
    op.execute(V_COMPRA)
    op.execute(V_VENDA)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_cotacoes_compra")
    op.execute("DROP VIEW IF EXISTS v_cotacoes_venda")
    op.execute(V_ANTIGA)
