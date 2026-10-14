"""views do assistente de IA (somente leitura, sem dados pessoais)

Revision ID: a2d5f8c1e9b7
Revises: e4a9c7d1b3f6
Create Date: 2026-10-14

O assistente de IA só enxerga estas 15 views (nunca as tabelas). Elas:
- embutem as regras de negócio (venda = status 'confirmado', data = confirmado_em, margem = subtotal - custo congelado);
- não expõem CPF/CNPJ, telefone, e-mail, endereço completo, senha nem observações livres;
- convertem valores Float dos pedidos para DECIMAL.
O usuário MySQL da IA recebe SELECT apenas nestas views (scripts/criar_usuario_ia.sql).
As views são SQL SECURITY DEFINER: executam com o dono (usuário da aplicação), então a IA não precisa de acesso às tabelas.
"""
from alembic import op

revision = "a2d5f8c1e9b7"
down_revision = "e4a9c7d1b3f6"
branch_labels = None
depends_on = None

_D = "DECIMAL(14,2)"

VIEWS = {
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

"v_clientes": """
SELECT c.id, c.nome, c.tipo,
       (SELECT e.cidade FROM cliente_endereco e WHERE e.cliente_id = c.id AND e.tipo = 'principal' AND e.ativo = 1 ORDER BY e.id LIMIT 1) AS cidade,
       (SELECT e.uf FROM cliente_endereco e WHERE e.cliente_id = c.id AND e.tipo = 'principal' AND e.ativo = 1 ORDER BY e.id LIMIT 1) AS uf,
       c.ativo
FROM cliente c""",

"v_fornecedores": """
SELECT f.id, f.nome, f.cidade, f.uf, f.ativo FROM fornecedor f""",

"v_geladeiras": """
SELECT g.id, g.tipo, g.modelo, g.marca, g.numero_serie, g.data_alocacao, g.status,
       g.cliente_id, c.nome AS cliente, e.cidade AS cidade, e.uf AS uf
FROM geladeira g
JOIN cliente c ON c.id = g.cliente_id
LEFT JOIN cliente_endereco e ON e.id = g.endereco_id""",

"v_manutencoes": """
SELECT h.id, h.geladeira_id, CONCAT(g.tipo, ' ', COALESCE(g.modelo, '')) AS geladeira, c.nome AS cliente,
       h.data, h.tipo, CAST(h.custo AS DECIMAL(14,2)) AS custo
FROM historico_manutencao h
JOIN geladeira g ON g.id = h.geladeira_id
JOIN cliente c ON c.id = g.cliente_id""",

"v_vendas": f"""
SELECT pv.id, pv.data_pedido, pv.confirmado_em, pv.status, pv.cliente_id, c.nome AS cliente,
       fp.descricao AS forma_pagamento, CAST(pv.valor_total AS {_D}) AS valor_total, u.nome AS vendedor
FROM pedido_venda pv
JOIN cliente c ON c.id = pv.cliente_id
JOIN usuario u ON u.id = pv.usuario_id
LEFT JOIN forma_pagamento fp ON fp.id = pv.forma_pagamento_id""",

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

"v_venda_margem": f"""
SELECT pv.id AS pedido_venda_id, pv.confirmado_em, c.nome AS cliente, i.produto_id, p.nome AS produto,
       cat.nome AS categoria, i.quantidade, CAST(i.subtotal AS {_D}) AS subtotal,
       CAST(COALESCE(i.custo_unitario, 0) AS DECIMAL(14,4)) AS custo_unitario,
       CAST(i.quantidade * COALESCE(i.custo_unitario, 0) AS {_D}) AS custo_total,
       CAST(i.subtotal - i.quantidade * COALESCE(i.custo_unitario, 0) AS {_D}) AS margem
FROM item_pedido_venda i
JOIN pedido_venda pv ON pv.id = i.pedido_venda_id AND pv.status = 'confirmado'
JOIN cliente c ON c.id = pv.cliente_id
JOIN produto p ON p.id = i.produto_id
JOIN categoria cat ON cat.id = p.categoria_id""",

"v_compras": f"""
SELECT pc.id, pc.data_pedido, pc.data_entrega_prevista, pc.status, pc.fornecedor_id, f.nome AS fornecedor,
       fp.descricao AS forma_pagamento, CAST(pc.valor_total AS {_D}) AS valor_total, u.nome AS comprador
FROM pedido_compra pc
JOIN fornecedor f ON f.id = pc.fornecedor_id
JOIN usuario u ON u.id = pc.usuario_id
LEFT JOIN forma_pagamento fp ON fp.id = pc.forma_pagamento_id""",

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

"v_receitas": """
SELECT r.id AS receita_id, pf.nome AS produto_final, r.rendimento, pi.nome AS insumo, ri.quantidade, r.ativo AS ativa
FROM receita r
JOIN produto pf ON pf.id = r.produto_id
JOIN receita_item ri ON ri.receita_id = r.id
JOIN produto pi ON pi.id = ri.produto_id""",

"v_producao": """
SELECT o.id, o.created_at, p.nome AS produto, o.quantidade, o.status,
       CAST(o.custo_total AS DECIMAL(14,2)) AS custo_total, CAST(o.custo_unitario AS DECIMAL(14,4)) AS custo_unitario,
       o.confirmada_em, o.cancelada_em
FROM ordem_producao o
JOIN produto p ON p.id = o.produto_id""",

"v_titulos": """
SELECT t.id, t.tipo,
       CASE WHEN t.pedido_venda_id IS NOT NULL THEN 'pedido_venda'
            WHEN t.pedido_compra_id IS NOT NULL THEN 'pedido_compra' ELSE 'avulso' END AS origem,
       COALESCE(t.pedido_venda_id, t.pedido_compra_id) AS pedido_id,
       COALESCE(c.nome, f.nome) AS parte, cf.nome AS categoria, t.descricao,
       t.numero_parcela, t.total_parcelas, t.vencimento, t.valor, t.valor_pago,
       CASE WHEN t.status IN ('pago', 'cancelado') THEN 0 ELSE t.valor - t.valor_pago END AS saldo,
       t.taxa_percentual, t.status,
       CASE WHEN t.status IN ('aberto', 'parcial') AND t.vencimento < CURDATE()
            THEN DATEDIFF(CURDATE(), t.vencimento) ELSE 0 END AS dias_em_atraso
FROM titulo_financeiro t
JOIN categoria_financeira cf ON cf.id = t.categoria_id
LEFT JOIN cliente c ON c.id = t.cliente_id
LEFT JOIN fornecedor f ON f.id = t.fornecedor_id""",

"v_baixas": """
SELECT b.id, b.titulo_id, t.tipo, COALESCE(c.nome, f.nome) AS parte, cf.nome AS categoria,
       b.data_pagamento, b.valor, b.estornada
FROM baixa_titulo b
JOIN titulo_financeiro t ON t.id = b.titulo_id
JOIN categoria_financeira cf ON cf.id = t.categoria_id
LEFT JOIN cliente c ON c.id = t.cliente_id
LEFT JOIN fornecedor f ON f.id = t.fornecedor_id""",
}


def upgrade() -> None:
    for nome, corpo in VIEWS.items():
        op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW {nome} AS {corpo}")


def downgrade() -> None:
    for nome in reversed(list(VIEWS)):
        op.execute(f"DROP VIEW IF EXISTS {nome}")
