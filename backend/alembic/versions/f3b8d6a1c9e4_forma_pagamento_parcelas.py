"""forma de pagamento com parcelas; pedido_venda passa a apontar para forma_pagamento

- cria forma_pagamento_parcela (o "molde" de parcelas de cada forma)
- cada forma existente vira 1 parcela de 100% com o seu prazo_dias antigo
- descricao passa a ser unica (duplicadas recebem " (id)" no final)
- forma_pagamento.tipo e prazo_dias saem (o tipo agora e calculado pelas parcelas)
- pedido_venda.forma_pagamento (texto) vira forma_pagamento_id (FK); o texto que nao
  casar com nenhuma descricao e preservado no fim da observacao

Revision ID: f3b8d6a1c9e4
Revises: e7a2c9d4b1f3
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = "f3b8d6a1c9e4"
down_revision = "e7a2c9d4b1f3"
branch_labels = None
depends_on = None

LIMITE_OBSERVACAO = 255


def upgrade() -> None:
    conn = op.get_bind()

    # 1. molde de parcelas
    op.create_table(
        "forma_pagamento_parcela",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("forma_pagamento_id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("prazo_dias", sa.Integer(), nullable=False),
        sa.Column("percentual", sa.Numeric(5, 2), nullable=False),
        sa.ForeignKeyConstraint(["forma_pagamento_id"], ["forma_pagamento.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("forma_pagamento_id", "numero", name="uq_forma_parcela_numero"),
    )
    conn.execute(sa.text(
        "INSERT INTO forma_pagamento_parcela (forma_pagamento_id, numero, prazo_dias, percentual) "
        "SELECT id, 1, COALESCE(prazo_dias, 0), 100.00 FROM forma_pagamento"
    ))

    # 2. descricao unica (a comparacao do MySQL ignora maiusculas/minusculas)
    conn.execute(sa.text(
        "UPDATE forma_pagamento f "
        "JOIN (SELECT MIN(id) AS menor_id, descricao FROM forma_pagamento GROUP BY descricao) m "
        "  ON m.descricao = f.descricao AND f.id <> m.menor_id "
        "SET f.descricao = CONCAT(LEFT(f.descricao, 90), ' (', f.id, ')')"
    ))
    op.create_unique_constraint("uq_forma_pagamento_descricao", "forma_pagamento", ["descricao"])

    # 3. pedido_venda: texto -> FK
    op.add_column("pedido_venda", sa.Column("forma_pagamento_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_pedido_venda_forma_pagamento", "pedido_venda", "forma_pagamento",
                          ["forma_pagamento_id"], ["id"])
    conn.execute(sa.text(
        "UPDATE pedido_venda pv "
        "JOIN forma_pagamento f ON LOWER(TRIM(pv.forma_pagamento)) = LOWER(TRIM(f.descricao)) "
        "SET pv.forma_pagamento_id = f.id "
        "WHERE pv.forma_pagamento IS NOT NULL"
    ))
    # o que nao casou nao se perde: vai para o fim da observacao
    sem_vinculo = conn.execute(sa.text(
        "SELECT id, forma_pagamento, observacao FROM pedido_venda "
        "WHERE forma_pagamento IS NOT NULL AND TRIM(forma_pagamento) <> '' AND forma_pagamento_id IS NULL"
    )).fetchall()
    for pedido_id, texto, observacao in sem_vinculo:
        nota = f"Forma de pagamento (legado): {texto.strip()}"
        base = (observacao or "").strip()
        if base:
            sobra = LIMITE_OBSERVACAO - len(nota) - 3
            base = base[:max(sobra, 0)]
        nova = f"{base} | {nota}" if base else nota
        conn.execute(sa.text("UPDATE pedido_venda SET observacao = :obs WHERE id = :id"),
                     {"obs": nova[:LIMITE_OBSERVACAO], "id": pedido_id})
    op.drop_column("pedido_venda", "forma_pagamento")

    # 4. tipo e prazo_dias saem de forma_pagamento
    op.drop_column("forma_pagamento", "tipo")
    op.drop_column("forma_pagamento", "prazo_dias")


def downgrade() -> None:
    conn = op.get_bind()

    op.add_column("forma_pagamento", sa.Column("prazo_dias", sa.Integer(), nullable=True))
    op.add_column("forma_pagamento", sa.Column("tipo", sa.String(length=20), nullable=False, server_default="vista"))
    conn.execute(sa.text(
        "UPDATE forma_pagamento f "
        "JOIN forma_pagamento_parcela p ON p.forma_pagamento_id = f.id AND p.numero = 1 "
        "SET f.prazo_dias = p.prazo_dias"
    ))
    conn.execute(sa.text(
        "UPDATE forma_pagamento f SET f.tipo = CASE "
        "  WHEN (SELECT COUNT(*) FROM forma_pagamento_parcela p WHERE p.forma_pagamento_id = f.id) > 1 THEN 'parcelado' "
        "  WHEN COALESCE(f.prazo_dias, 0) > 0 THEN 'prazo' ELSE 'vista' END"
    ))
    op.alter_column("forma_pagamento", "tipo", existing_type=sa.String(length=20),
                    existing_nullable=False, server_default=None)

    op.add_column("pedido_venda", sa.Column("forma_pagamento", sa.String(length=30), nullable=True))
    conn.execute(sa.text(
        "UPDATE pedido_venda pv JOIN forma_pagamento f ON f.id = pv.forma_pagamento_id "
        "SET pv.forma_pagamento = LEFT(f.descricao, 30)"
    ))
    op.drop_constraint("fk_pedido_venda_forma_pagamento", "pedido_venda", type_="foreignkey")
    op.drop_column("pedido_venda", "forma_pagamento_id")

    op.drop_constraint("uq_forma_pagamento_descricao", "forma_pagamento", type_="unique")
    op.drop_table("forma_pagamento_parcela")
