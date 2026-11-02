"""manutenção de geladeira com custo gera título a pagar

Revision ID: b5e2d8f4a6c1
Revises: e8c4a1f7b2d9
Create Date: 2026-11-02

- titulo_financeiro.historico_manutencao_id (FK, única, ON DELETE SET NULL): o título da despesa de uma manutenção.
  A manutenção é excluída de verdade; o título dela é cancelado antes e fica no Financeiro sem o vínculo.
- A categoria "Manutenção" (pagar) passa a ser do sistema: não pode ser renomeada nem desativada. É criada se não existir.
- Manutenções que já têm custo ganham o título (aberto, vencimento = data da manutenção).
- v_titulos (assistente): origem passa a ter 'manutencao'.
"""
from alembic import op
import sqlalchemy as sa

revision = "b5e2d8f4a6c1"
down_revision = "e8c4a1f7b2d9"
branch_labels = None
depends_on = None

_V_TITULOS = """
SELECT t.id, t.tipo,
       CASE WHEN t.pedido_venda_id IS NOT NULL THEN 'pedido_venda'
            WHEN t.pedido_compra_id IS NOT NULL THEN 'pedido_compra'
            WHEN t.historico_manutencao_id IS NOT NULL THEN 'manutencao' ELSE 'avulso' END AS origem,
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
LEFT JOIN fornecedor f ON f.id = t.fornecedor_id"""

_V_TITULOS_ANTIGA = """
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
LEFT JOIN fornecedor f ON f.id = t.fornecedor_id"""


def upgrade() -> None:
    op.add_column("titulo_financeiro", sa.Column("historico_manutencao_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_titulo_manutencao", "titulo_financeiro", "historico_manutencao",
                          ["historico_manutencao_id"], ["id"], ondelete="SET NULL")
    op.create_unique_constraint("uq_titulo_manutencao", "titulo_financeiro", ["historico_manutencao_id"])

    # Categoria "Manutenção" do sistema (a migração das categorias já a criou como comum; aqui ela é protegida)
    op.execute("""
        INSERT INTO categoria_financeira (nome, tipo, sistema, ativo)
        SELECT 'Manutenção', 'pagar', 1, 1 FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM categoria_financeira WHERE nome = 'Manutenção' AND tipo = 'pagar')""")
    op.execute("UPDATE categoria_financeira SET sistema = 1, ativo = 1 WHERE nome = 'Manutenção' AND tipo = 'pagar'")

    # Manutenções com custo que já existem ganham o título (em aberto; quem já pagou dá a baixa no Financeiro)
    op.execute("""
        INSERT INTO titulo_financeiro (tipo, historico_manutencao_id, categoria_id, descricao, numero_parcela, total_parcelas,
                                       vencimento, valor, taxa_percentual, valor_pago, status, created_at, updated_at)
        SELECT 'pagar', h.id, cf.id,
               CONCAT('Manutenção ', h.tipo, ' — geladeira ', COALESCE(g.numero_serie, CONCAT('#', g.id))),
               1, 1, DATE(h.data), ROUND(h.custo, 2), 0, 0, 'aberto', h.data, h.data
        FROM historico_manutencao h
        JOIN geladeira g ON g.id = h.geladeira_id
        JOIN categoria_financeira cf ON cf.nome = 'Manutenção' AND cf.tipo = 'pagar'
        WHERE h.custo > 0
          AND NOT EXISTS (SELECT 1 FROM titulo_financeiro t WHERE t.historico_manutencao_id = h.id)""")

    # CREATE OR REPLACE mantém os GRANTs do usuário da IA (e o preparar_banco.py os reaplica ao subir o container)
    op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_titulos AS {_V_TITULOS}")


def downgrade() -> None:
    op.execute(f"CREATE OR REPLACE SQL SECURITY DEFINER VIEW v_titulos AS {_V_TITULOS_ANTIGA}")
    # Os títulos de manutenção ficam como lançamentos avulsos (a descrição diz de qual geladeira são)
    op.drop_constraint("fk_titulo_manutencao", "titulo_financeiro", type_="foreignkey")   # a FK antes do índice que ela usa
    op.drop_constraint("uq_titulo_manutencao", "titulo_financeiro", type_="unique")
    op.drop_column("titulo_financeiro", "historico_manutencao_id")
    op.execute("UPDATE categoria_financeira SET sistema = 0 WHERE nome = 'Manutenção' AND tipo = 'pagar'")
