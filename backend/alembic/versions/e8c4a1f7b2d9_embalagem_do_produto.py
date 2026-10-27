"""embalagem do produto (ex.: Pote de 5 L) com fator de conversão para a unidade base

Revision ID: e8c4a1f7b2d9
Revises: d7b3e9a1c5f4
Create Date: 2026-10-26

- produto.embalagem_unidade_id (opcional) e produto.fator_embalagem (padrão 1): quantas unidades base cabem na embalagem.
- item_pedido_venda.fator, item_pedido_compra.fator, item_cotacao.fator: o fator usado quando o item foi gravado.
  A quantidade do item fica na embalagem; o estoque se move em quantidade x fator (unidade base).
- Tudo o que já existe recebe fator 1: nada muda para os produtos sem embalagem.
- Views do assistente: v_produtos ganha embalagem/fator; v_venda_itens, v_compra_itens e v_cotacao_itens ganham fator
  e a quantidade convertida para a unidade base.
"""
from alembic import op
import sqlalchemy as sa

revision = "e8c4a1f7b2d9"
down_revision = "d7b3e9a1c5f4"
branch_labels = None
depends_on = None

QTD = sa.Numeric(12, 3)
_D = "DECIMAL(14,2)"
ITENS = ("item_pedido_venda", "item_pedido_compra", "item_cotacao")

VIEWS_NOVAS = {
"v_produtos": f"""
SELECT p.id, p.nome, c.nome AS categoria, sc.nome AS subcategoria, u.sigla AS unidade,
       emb.sigla AS embalagem, p.fator_embalagem,
       p.e_insumo, p.e_vendavel,
       CAST(p.preco_custo AS {_D}) AS preco_custo, CAST(p.preco_venda AS {_D}) AS preco_venda,
       COALESCE(p.estoque_atual, 0) AS estoque_atual, COALESCE(p.estoque_reservado, 0) AS estoque_reservado,
       COALESCE(p.estoque_atual, 0) - COALESCE(p.estoque_reservado, 0) AS estoque_disponivel,
       COALESCE(p.estoque_minimo, 0) AS estoque_minimo,
       CASE WHEN COALESCE(p.estoque_atual, 0) <= COALESCE(p.estoque_minimo, 0) THEN 1 ELSE 0 END AS abaixo_do_minimo,
       p.ativo
FROM produto p
JOIN categoria c ON c.id = p.categoria_id
JOIN subcategoria sc ON sc.id = p.subcategoria_id
JOIN unidade_medida u ON u.id = p.unidade_medida_id
LEFT JOIN unidade_medida emb ON emb.id = p.embalagem_unidade_id""",

"v_venda_itens": f"""
SELECT pv.id AS pedido_venda_id, pv.data_pedido, pv.confirmado_em, pv.status, pv.cliente_id, c.nome AS cliente,
       i.produto_id, p.nome AS produto, cat.nome AS categoria, i.quantidade, i.fator,
       i.quantidade * i.fator AS quantidade_base,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CAST(i.subtotal AS {_D}) AS subtotal
FROM item_pedido_venda i
JOIN pedido_venda pv ON pv.id = i.pedido_venda_id
JOIN cliente c ON c.id = pv.cliente_id
JOIN produto p ON p.id = i.produto_id
JOIN categoria cat ON cat.id = p.categoria_id""",

"v_compra_itens": f"""
SELECT pc.id AS pedido_compra_id, pc.data_pedido, pc.status, pc.fornecedor_id, f.nome AS fornecedor,
       i.produto_id, p.nome AS produto, i.quantidade, i.quantidade_recebida, i.fator,
       i.quantidade * i.fator AS quantidade_base,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(i.subtotal AS {_D}) AS subtotal
FROM item_pedido_compra i
JOIN pedido_compra pc ON pc.id = i.pedido_compra_id
JOIN fornecedor f ON f.id = pc.fornecedor_id
JOIN produto p ON p.id = i.produto_id""",

"v_cotacao_itens": f"""
SELECT ct.id AS cotacao_id, ct.tipo, ct.data_cotacao, ct.validade, ct.status,
       COALESCE(f.nome, c.nome) AS parte, i.produto_id, p.nome AS produto, i.quantidade, i.fator,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CASE WHEN i.preco_unitario IS NULL THEN NULL
            ELSE CAST(i.quantidade * i.preco_unitario - COALESCE(i.desconto, 0) AS {_D}) END AS subtotal
FROM item_cotacao i
JOIN cotacao ct ON ct.id = i.cotacao_id
JOIN produto p ON p.id = i.produto_id
LEFT JOIN fornecedor f ON f.id = ct.fornecedor_id
LEFT JOIN cliente c ON c.id = ct.cliente_id""",
}

# Definições anteriores (migration a2d5f8c1e9b7), para o downgrade.
VIEWS_ANTIGAS = {
"v_produtos": f"""
SELECT p.id, p.nome, c.nome AS categoria, sc.nome AS subcategoria, u.sigla AS unidade,
       p.e_insumo, p.e_vendavel,
       CAST(p.preco_custo AS {_D}) AS preco_custo, CAST(p.preco_venda AS {_D}) AS preco_venda,
       COALESCE(p.estoque_atual, 0) AS estoque_atual, COALESCE(p.estoque_reservado, 0) AS estoque_reservado,
       COALESCE(p.estoque_atual, 0) - COALESCE(p.estoque_reservado, 0) AS estoque_disponivel,
       COALESCE(p.estoque_minimo, 0) AS estoque_minimo,
       CASE WHEN COALESCE(p.estoque_atual, 0) <= COALESCE(p.estoque_minimo, 0) THEN 1 ELSE 0 END AS abaixo_do_minimo,
       p.ativo
FROM produto p
JOIN categoria c ON c.id = p.categoria_id
JOIN subcategoria sc ON sc.id = p.subcategoria_id
JOIN unidade_medida u ON u.id = p.unidade_medida_id""",

"v_venda_itens": f"""
SELECT pv.id AS pedido_venda_id, pv.data_pedido, pv.confirmado_em, pv.status, pv.cliente_id, c.nome AS cliente,
       i.produto_id, p.nome AS produto, cat.nome AS categoria, i.quantidade,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CAST(i.subtotal AS {_D}) AS subtotal
FROM item_pedido_venda i
JOIN pedido_venda pv ON pv.id = i.pedido_venda_id
JOIN cliente c ON c.id = pv.cliente_id
JOIN produto p ON p.id = i.produto_id
JOIN categoria cat ON cat.id = p.categoria_id""",

"v_compra_itens": f"""
SELECT pc.id AS pedido_compra_id, pc.data_pedido, pc.status, pc.fornecedor_id, f.nome AS fornecedor,
       i.produto_id, p.nome AS produto, i.quantidade, i.quantidade_recebida,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(i.subtotal AS {_D}) AS subtotal
FROM item_pedido_compra i
JOIN pedido_compra pc ON pc.id = i.pedido_compra_id
JOIN fornecedor f ON f.id = pc.fornecedor_id
JOIN produto p ON p.id = i.produto_id""",

"v_cotacao_itens": f"""
SELECT ct.id AS cotacao_id, ct.tipo, ct.data_cotacao, ct.validade, ct.status,
       COALESCE(f.nome, c.nome) AS parte, i.produto_id, p.nome AS produto, i.quantidade,
       CAST(i.preco_unitario AS {_D}) AS preco_unitario, CAST(COALESCE(i.desconto, 0) AS {_D}) AS desconto,
       CASE WHEN i.preco_unitario IS NULL THEN NULL
            ELSE CAST(i.quantidade * i.preco_unitario - COALESCE(i.desconto, 0) AS {_D}) END AS subtotal
FROM item_cotacao i
JOIN cotacao ct ON ct.id = i.cotacao_id
JOIN produto p ON p.id = i.produto_id
LEFT JOIN fornecedor f ON f.id = ct.fornecedor_id
LEFT JOIN cliente c ON c.id = ct.cliente_id""",
}


def _adicionar_fator(tabela: str, coluna: str) -> None:
    # server_default só para preencher as linhas que já existem com 1; depois sai (o padrão fica no models.py)
    op.add_column(tabela, sa.Column(coluna, QTD, nullable=False, server_default=sa.text("1")))
    op.alter_column(tabela, coluna, existing_type=QTD, existing_nullable=False, server_default=None)


def upgrade() -> None:
    op.add_column("produto", sa.Column("embalagem_unidade_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_produto_embalagem_unidade", "produto", "unidade_medida", ["embalagem_unidade_id"], ["id"])
    _adicionar_fator("produto", "fator_embalagem")
    for tabela in ITENS:
        _adicionar_fator(tabela, "fator")
    # CREATE OR REPLACE mantém os GRANTs do usuário da IA (e o preparar_banco.py os reaplica ao subir o container)
    for nome, corpo in VIEWS_NOVAS.items():
        op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW {nome} AS {corpo}")


def downgrade() -> None:
    for nome, corpo in VIEWS_ANTIGAS.items():
        op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW {nome} AS {corpo}")
    for tabela in ITENS:
        op.drop_column(tabela, "fator")
    op.drop_column("produto", "fator_embalagem")
    op.drop_constraint("fk_produto_embalagem_unidade", "produto", type_="foreignkey")
    op.drop_column("produto", "embalagem_unidade_id")
