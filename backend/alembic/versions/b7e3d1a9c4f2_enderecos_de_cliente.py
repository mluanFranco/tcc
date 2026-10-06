"""enderecos de cliente (principal + entregas) e endereco da geladeira

Revision ID: b7e3d1a9c4f2
Revises: 8ca3198d99de
Create Date: 2026-10-06 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e3d1a9c4f2'
down_revision: Union[str, Sequence[str], None] = '8ca3198d99de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COLUNAS_ENDERECO_CLIENTE = [
    ('cep', sa.String(length=9)),
    ('logradouro', sa.String(length=150)),
    ('numero', sa.String(length=10)),
    ('complemento', sa.String(length=100)),
    ('bairro', sa.String(length=80)),
    ('cidade', sa.String(length=80)),
    ('uf', sa.String(length=2)),
    ('ddd', sa.String(length=3)),
]


def _sem_mascara(coluna: str) -> str:
    # Remove . - / e espaços (SQL portável, sem depender de REGEXP_REPLACE)
    return f"REPLACE(REPLACE(REPLACE(REPLACE({coluna}, '.', ''), '-', ''), '/', ''), ' ', '')"


def upgrade() -> None:
    """Upgrade schema."""
    # 1) Nova tabela de endereços do cliente
    op.create_table('cliente_endereco',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('cliente_id', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('cep', sa.String(length=9), nullable=True),
    sa.Column('logradouro', sa.String(length=150), nullable=True),
    sa.Column('numero', sa.String(length=10), nullable=True),
    sa.Column('complemento', sa.String(length=100), nullable=True),
    sa.Column('bairro', sa.String(length=80), nullable=True),
    sa.Column('cidade', sa.String(length=80), nullable=True),
    sa.Column('uf', sa.String(length=2), nullable=True),
    sa.Column('ddd', sa.String(length=3), nullable=True),
    sa.Column('ativo', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['cliente_id'], ['cliente.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # 2) Copia o endereço que já estava no cliente para virar o endereço principal
    #    (só clientes que tinham algum dado de endereço preenchido)
    op.execute(sa.text(f"""
        INSERT INTO cliente_endereco
            (cliente_id, tipo, cep, logradouro, numero, complemento, bairro, cidade, uf, ddd, ativo, created_at, updated_at)
        SELECT id, 'principal', {_sem_mascara('cep')}, logradouro, numero, complemento, bairro, cidade, uf, ddd, 1, created_at, updated_at
        FROM cliente
        WHERE cep IS NOT NULL OR logradouro IS NOT NULL OR numero IS NOT NULL OR complemento IS NOT NULL
           OR bairro IS NOT NULL OR cidade IS NOT NULL OR uf IS NOT NULL OR ddd IS NOT NULL
    """))

    # 3) Geladeira passa a apontar para um endereço do cliente
    op.add_column('geladeira', sa.Column('endereco_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_geladeira_endereco', 'geladeira', 'cliente_endereco', ['endereco_id'], ['id'])

    # 4) Geladeiras existentes ficam no endereço principal do cliente (quando houver)
    op.execute(sa.text("""
        UPDATE geladeira g
        JOIN cliente_endereco e ON e.cliente_id = g.cliente_id AND e.tipo = 'principal'
        SET g.endereco_id = e.id
    """))

    # 5) O endereço sai da tabela cliente
    for nome, _tipo in COLUNAS_ENDERECO_CLIENTE:
        op.drop_column('cliente', nome)

    # 6) Documentos e CEP passam a ser guardados sem máscara
    op.execute(sa.text(f"UPDATE cliente SET cpf_cnpj = UPPER({_sem_mascara('cpf_cnpj')})"))
    op.execute(sa.text(f"UPDATE fornecedor SET cnpj = UPPER({_sem_mascara('cnpj')})"))
    op.execute(sa.text(f"UPDATE fornecedor SET cep = {_sem_mascara('cep')} WHERE cep IS NOT NULL"))


def downgrade() -> None:
    """Downgrade schema."""
    # Devolve as colunas de endereço ao cliente e traz de volta o endereço principal
    for nome, tipo in COLUNAS_ENDERECO_CLIENTE:
        op.add_column('cliente', sa.Column(nome, tipo, nullable=True))

    op.execute(sa.text("""
        UPDATE cliente c
        JOIN cliente_endereco e ON e.cliente_id = c.id AND e.tipo = 'principal' AND e.ativo = 1
        SET c.cep = e.cep, c.logradouro = e.logradouro, c.numero = e.numero,
            c.complemento = e.complemento, c.bairro = e.bairro, c.cidade = e.cidade,
            c.uf = e.uf, c.ddd = e.ddd
    """))

    op.drop_constraint('fk_geladeira_endereco', 'geladeira', type_='foreignkey')
    op.drop_column('geladeira', 'endereco_id')
    op.drop_table('cliente_endereco')