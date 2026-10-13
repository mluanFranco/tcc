"""financeiro: titulos (contas a pagar e a receber) e baixas

- titulo_financeiro: uma linha por parcela de pedido (receber = venda, pagar = compra)
- baixa_titulo: pagamentos/recebimentos (parciais ou totais), com estorno que preserva o historico
- pedidos que ja existem ganham seus titulos (compras nao canceladas e vendas confirmadas);
  pedido sem forma de pagamento vira um titulo unico a vista

Revision ID: b5c1e8f2a7d3
Revises: a9d4e1b7c3f6
Create Date: 2026-10-13
"""
from datetime import timedelta
from decimal import Decimal, ROUND_DOWN

from alembic import op
import sqlalchemy as sa

revision = "b5c1e8f2a7d3"
down_revision = "a9d4e1b7c3f6"
branch_labels = None
depends_on = None

CHECK_TIPO_ORIGEM = (
    "(tipo = 'receber' AND pedido_compra_id IS NULL AND fornecedor_id IS NULL) OR "
    "(tipo = 'pagar' AND pedido_venda_id IS NULL AND cliente_id IS NULL)"
)
CENTAVO = Decimal("0.01")


def _dividir(parcelas, total, data_base):
    """Mesma regra de core/pagamento.gerar_parcelas: a ultima parcela fica com o que sobrou."""
    resultado, acumulado = [], Decimal("0.00")
    for indice, (numero, prazo, percentual) in enumerate(parcelas):
        if indice == len(parcelas) - 1:
            valor = total - acumulado
        else:
            valor = (total * percentual / Decimal("100")).quantize(CENTAVO, rounding=ROUND_DOWN)
            acumulado += valor
        resultado.append((numero, data_base + timedelta(days=prazo), valor))
    return resultado


def upgrade() -> None:
    op.create_table(
        "titulo_financeiro",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("pedido_venda_id", sa.Integer(), nullable=True),
        sa.Column("pedido_compra_id", sa.Integer(), nullable=True),
        sa.Column("cliente_id", sa.Integer(), nullable=True),
        sa.Column("fornecedor_id", sa.Integer(), nullable=True),
        sa.Column("numero_parcela", sa.Integer(), nullable=False),
        sa.Column("total_parcelas", sa.Integer(), nullable=False),
        sa.Column("vencimento", sa.Date(), nullable=False),
        sa.Column("valor", sa.Numeric(12, 2), nullable=False),
        sa.Column("taxa_percentual", sa.Numeric(5, 2), nullable=False),
        sa.Column("valor_pago", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["pedido_venda_id"], ["pedido_venda.id"], name="fk_titulo_pedido_venda"),
        sa.ForeignKeyConstraint(["pedido_compra_id"], ["pedido_compra.id"], name="fk_titulo_pedido_compra"),
        sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"], name="fk_titulo_cliente"),
        sa.ForeignKeyConstraint(["fornecedor_id"], ["fornecedor.id"], name="fk_titulo_fornecedor"),
        sa.UniqueConstraint("pedido_venda_id", "numero_parcela", name="uq_titulo_pedido_venda_parcela"),
        sa.UniqueConstraint("pedido_compra_id", "numero_parcela", name="uq_titulo_pedido_compra_parcela"),
        sa.CheckConstraint(CHECK_TIPO_ORIGEM, name="ck_titulo_tipo_origem"),
        sa.CheckConstraint("valor > 0", name="ck_titulo_valor_positivo"),
    )
    op.create_index("ix_titulo_tipo_status_vencimento", "titulo_financeiro", ["tipo", "status", "vencimento"])

    op.create_table(
        "baixa_titulo",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("titulo_id", sa.Integer(), nullable=False),
        sa.Column("valor", sa.Numeric(12, 2), nullable=False),
        sa.Column("data_pagamento", sa.Date(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("observacao", sa.String(length=255), nullable=True),
        sa.Column("estornada", sa.Boolean(), nullable=False),
        sa.Column("estornada_em", sa.DateTime(), nullable=True),
        sa.Column("estornada_por_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["titulo_id"], ["titulo_financeiro.id"], name="fk_baixa_titulo"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"], name="fk_baixa_usuario"),
        sa.ForeignKeyConstraint(["estornada_por_id"], ["usuario.id"], name="fk_baixa_estornada_por"),
        sa.CheckConstraint("valor > 0", name="ck_baixa_valor_positivo"),
    )

    _gerar_titulos_dos_pedidos_existentes()


def _gerar_titulos_dos_pedidos_existentes() -> None:
    conn = op.get_bind()

    moldes = {}
    for forma_id, numero, prazo, percentual in conn.execute(sa.text(
        "SELECT forma_pagamento_id, numero, prazo_dias, percentual FROM forma_pagamento_parcela ORDER BY forma_pagamento_id, numero"
    )):
        moldes.setdefault(forma_id, []).append((numero, prazo, Decimal(str(percentual))))
    taxas = {fid: Decimal(str(t or 0)).quantize(CENTAVO) for fid, t in conn.execute(sa.text(
        "SELECT id, taxa_percentual FROM forma_pagamento"))}

    inserir = sa.text(
        "INSERT INTO titulo_financeiro (tipo, pedido_venda_id, pedido_compra_id, cliente_id, fornecedor_id, "
        "numero_parcela, total_parcelas, vencimento, valor, taxa_percentual, valor_pago, status, created_at, updated_at) "
        "VALUES (:tipo, :pv, :pc, :cli, :forn, :num, :tot, :venc, :valor, :taxa, 0, 'aberto', NOW(), NOW())"
    )

    def gerar(tipo, pedido_id, parte_id, forma_id, valor_total, data_base):
        total = Decimal(str(valor_total or 0)).quantize(CENTAVO)
        if total <= 0:
            return
        parcelas = moldes.get(forma_id) or [(1, 0, Decimal("100"))]
        divididas = _dividir(parcelas, total, data_base)
        taxa = taxas.get(forma_id, Decimal("0.00")) if tipo == "receber" else Decimal("0.00")
        for numero, vencimento, valor in divididas:
            conn.execute(inserir, {
                "tipo": tipo,
                "pv": pedido_id if tipo == "receber" else None,
                "pc": pedido_id if tipo == "pagar" else None,
                "cli": parte_id if tipo == "receber" else None,
                "forn": parte_id if tipo == "pagar" else None,
                "num": numero, "tot": len(divididas), "venc": vencimento, "valor": valor, "taxa": taxa,
            })

    # compras que nao foram canceladas: o titulo nasce com o pedido
    for pid, fornecedor_id, forma_id, valor_total, data_pedido in conn.execute(sa.text(
        "SELECT id, fornecedor_id, forma_pagamento_id, valor_total, data_pedido FROM pedido_compra WHERE status <> 'cancelado'"
    )).fetchall():
        gerar("pagar", pid, fornecedor_id, forma_id, valor_total, data_pedido.date())

    # vendas confirmadas: o titulo nasce na confirmacao (a data da ultima alteracao e a melhor aproximacao dela)
    for pid, cliente_id, forma_id, valor_total, data_base in conn.execute(sa.text(
        "SELECT id, cliente_id, forma_pagamento_id, valor_total, COALESCE(updated_at, data_pedido) "
        "FROM pedido_venda WHERE status = 'confirmado'"
    )).fetchall():
        gerar("receber", pid, cliente_id, forma_id, valor_total, data_base.date())


def downgrade() -> None:
    op.drop_table("baixa_titulo")
    op.drop_index("ix_titulo_tipo_status_vencimento", table_name="titulo_financeiro")
    op.drop_table("titulo_financeiro")
