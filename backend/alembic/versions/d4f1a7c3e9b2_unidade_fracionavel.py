"""unidade de medida fracionável x inteira, e correção das quantidades quebradas em unidades inteiras

Revision ID: d4f1a7c3e9b2
Revises: c8e2f4a6d1b9
Create Date: 2026-11-25

- unidade_medida.fracionavel (BOOLEAN, padrão TRUE). Unidades de contagem (un, Pt, Cx, Fd, Sc, Bd, Gl, Pct, Lt)
  passam a ser INTEIRAS (FALSE): quantidades nelas não aceitam casas decimais.
- Correção dos dados que já estavam quebrados em unidades inteiras:
  * estoque mínimo: arredondado PARA CIMA (ex.: 4,2 un -> 5 un; mínimo maior é o lado seguro);
  * itens de ordens de produção ABERTAS (reservas): arredondados para cima e a diferença somada ao estoque_reservado,
    a mesma regra que o cálculo do consumo passa a usar (1,4 pote -> 2).
  Estoque atual/reservado e itens de pedidos não são alterados aqui (nos dados atuais não há casos); a varredura
  que motivou esta migration está no histórico do projeto.
"""
import sqlalchemy as sa
from alembic import op

revision = "d4f1a7c3e9b2"
down_revision = "c8e2f4a6d1b9"
branch_labels = None
depends_on = None

INTEIRAS = ("un", "pt", "cx", "fd", "sc", "bd", "gl", "pct", "lt")


def upgrade() -> None:
    op.add_column("unidade_medida", sa.Column("fracionavel", sa.Boolean(), nullable=False, server_default=sa.true()))
    con = op.get_bind()
    lista = ", ".join(f"'{s}'" for s in INTEIRAS)
    con.execute(sa.text(f"UPDATE unidade_medida SET fracionavel = FALSE WHERE LOWER(sigla) IN ({lista})"))

    # estoque mínimo quebrado em unidade inteira -> para cima
    con.execute(sa.text("""
        UPDATE produto p JOIN unidade_medida u ON u.id = p.unidade_medida_id
        SET p.estoque_minimo = CEIL(p.estoque_minimo)
        WHERE u.fracionavel = FALSE AND p.estoque_minimo <> FLOOR(p.estoque_minimo)"""))

    # reservas de ordens abertas quebradas em insumo de unidade inteira -> para cima, ajustando o reservado
    itens = con.execute(sa.text("""
        SELECT i.id, i.produto_id, i.quantidade, CEIL(i.quantidade) AS nova
        FROM ordem_producao_item i
        JOIN ordem_producao o ON o.id = i.ordem_id
        JOIN produto p ON p.id = i.produto_id
        JOIN unidade_medida u ON u.id = p.unidade_medida_id
        WHERE o.status = 'aberta' AND u.fracionavel = FALSE AND i.quantidade <> FLOOR(i.quantidade)""")).fetchall()
    for item_id, produto_id, atual, nova in itens:
        con.execute(sa.text("UPDATE ordem_producao_item SET quantidade = :n, subtotal = ROUND(:n * custo_unitario, 2) WHERE id = :i"),
                    {"n": nova, "i": item_id})
        con.execute(sa.text("UPDATE produto SET estoque_reservado = estoque_reservado + :d WHERE id = :p"),
                    {"d": nova - atual, "p": produto_id})


def downgrade() -> None:
    # os arredondamentos de dados não são desfeitos (eram correções)
    op.drop_column("unidade_medida", "fracionavel")
