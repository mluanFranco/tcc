"""ordem de produção aberta passa a reservar os insumos (só dados)

Revision ID: c8e2f4a6d1b9
Revises: a3d7e9c1f5b2
Create Date: 2026-11-25

Antes, a ordem aberta não reservava nada e os itens (ordem_producao_item) só eram gravados na confirmação.
Agora a ordem aberta grava os itens com a quantidade de cada insumo e soma essa quantidade em
produto.estoque_reservado; a confirmação consome exatamente o reservado.

Esta migration aplica a regra às ordens que já estavam abertas: calcula o consumo pela receita
(mesma conta de core/receita.py: quantidade_do_item * qtd / rendimento, arredondado PARA CIMA na 3ª casa),
grava os itens (custo = prévia, recalculado na confirmação) e reserva. Não muda nenhuma estrutura.
Se faltar insumo para alguma ordem, a reserva é feita mesmo assim (o disponível fica negativo e aparece na tela);
nos dados atuais não falta.
"""
from decimal import Decimal, ROUND_CEILING

import sqlalchemy as sa
from alembic import op

revision = "c8e2f4a6d1b9"
down_revision = "a3d7e9c1f5b2"
branch_labels = None
depends_on = None

_TRES_CASAS = Decimal("0.001")


def upgrade() -> None:
    con = op.get_bind()
    ordens = con.execute(sa.text("""
        SELECT o.id, o.quantidade, r.id AS receita_id, r.rendimento
        FROM ordem_producao o JOIN receita r ON r.id = o.receita_id
        WHERE o.status = 'aberta'
          AND NOT EXISTS (SELECT 1 FROM ordem_producao_item i WHERE i.ordem_id = o.id)
        ORDER BY o.id""")).fetchall()
    for ordem_id, qtd, receita_id, rendimento in ordens:
        fator = Decimal(qtd) / Decimal(rendimento)
        itens = con.execute(sa.text("""
            SELECT ri.produto_id, ri.quantidade, p.preco_custo, p.fator_embalagem
            FROM receita_item ri JOIN produto p ON p.id = ri.produto_id
            WHERE ri.receita_id = :r ORDER BY ri.id"""), {"r": receita_id}).fetchall()
        for produto_id, qtd_item, preco_custo, fator_emb in itens:
            consumo = (Decimal(qtd_item) * fator).quantize(_TRES_CASAS, rounding=ROUND_CEILING)
            custo = float(preco_custo or 0) / float(fator_emb or 1)
            con.execute(sa.text("""
                INSERT INTO ordem_producao_item (ordem_id, produto_id, quantidade, custo_unitario, subtotal)
                VALUES (:o, :p, :q, :c, :s)"""),
                {"o": ordem_id, "p": produto_id, "q": consumo, "c": custo, "s": round(float(consumo) * custo, 2)})
            con.execute(sa.text("UPDATE produto SET estoque_reservado = COALESCE(estoque_reservado, 0) + :q WHERE id = :p"),
                        {"q": consumo, "p": produto_id})


def downgrade() -> None:
    con = op.get_bind()
    itens = con.execute(sa.text("""
        SELECT i.produto_id, i.quantidade FROM ordem_producao_item i
        JOIN ordem_producao o ON o.id = i.ordem_id WHERE o.status = 'aberta'""")).fetchall()
    for produto_id, qtd in itens:
        con.execute(sa.text("UPDATE produto SET estoque_reservado = GREATEST(0, estoque_reservado - :q) WHERE id = :p"),
                    {"q": qtd, "p": produto_id})
    con.execute(sa.text("""
        DELETE i FROM ordem_producao_item i JOIN ordem_producao o ON o.id = i.ordem_id WHERE o.status = 'aberta'"""))
