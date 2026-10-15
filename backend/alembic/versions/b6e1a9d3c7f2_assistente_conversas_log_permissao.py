"""assistente de IA: conversas, mensagens, auditoria e a permissão assistente.ver

Revision ID: b6e1a9d3c7f2
Revises: a2d5f8c1e9b7
Create Date: 2026-10-14

- assistente_conversa, assistente_mensagem, assistente_log
- permissão 'assistente.ver' (catálogo passa de 14 para 15 permissões), concedida aos 3 grupos padrão
  que existirem (Gerência, Operacional, Consulta). Grupos criados à mão ficam sem ela até o admin marcar.
"""
from alembic import op
import sqlalchemy as sa

revision = "b6e1a9d3c7f2"
down_revision = "a2d5f8c1e9b7"
branch_labels = None
depends_on = None

_CODIGO = "assistente.ver"
_DESCRICAO = "Visualizar — Assistente de IA: perguntas em linguagem natural sobre os dados que o usuário já pode ver"
_GRUPOS = ("Gerência", "Operacional", "Consulta")


def upgrade() -> None:
    op.create_table(
        "assistente_conversa",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("ativa", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"]),
    )
    op.create_index("ix_assistente_conversa_usuario_id", "assistente_conversa", ["usuario_id"])
    op.create_table(
        "assistente_mensagem",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("conversa_id", sa.Integer(), nullable=False),
        sa.Column("papel", sa.String(10), nullable=False),
        sa.Column("conteudo", sa.Text(), nullable=False),
        sa.Column("tabela", sa.Text()),
        sa.Column("consultas", sa.Text()),
        sa.Column("tokens_entrada", sa.Integer()),
        sa.Column("tokens_saida", sa.Integer()),
        sa.Column("duracao_ms", sa.Integer()),
        sa.Column("created_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["conversa_id"], ["assistente_conversa.id"]),
    )
    op.create_index("ix_assistente_mensagem_conversa_id", "assistente_mensagem", ["conversa_id"])
    op.create_index("ix_assistente_mensagem_created_at", "assistente_mensagem", ["created_at"])
    op.create_table(
        "assistente_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("conversa_id", sa.Integer()),
        sa.Column("mensagem_id", sa.Integer()),
        sa.Column("pergunta", sa.String(500)),
        sa.Column("ferramenta", sa.String(40), nullable=False),
        sa.Column("entrada", sa.Text()),
        sa.Column("views", sa.String(255)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("linhas", sa.Integer()),
        sa.Column("duracao_ms", sa.Integer()),
        sa.Column("erro", sa.String(255)),
        sa.Column("created_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"]),
        sa.ForeignKeyConstraint(["conversa_id"], ["assistente_conversa.id"]),
        sa.ForeignKeyConstraint(["mensagem_id"], ["assistente_mensagem.id"]),
    )
    op.create_index("ix_assistente_log_usuario_id", "assistente_log", ["usuario_id"])
    op.create_index("ix_assistente_log_created_at", "assistente_log", ["created_at"])

    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO permissao (codigo, modulo, acao, descricao) VALUES (:c, 'assistente', 'ver', :d)"),
        {"c": _CODIGO, "d": _DESCRICAO},
    )
    pid = conn.execute(sa.text("SELECT id FROM permissao WHERE codigo = :c"), {"c": _CODIGO}).scalar()
    for nome in _GRUPOS:
        gid = conn.execute(sa.text("SELECT id FROM grupo_acesso WHERE nome = :n"), {"n": nome}).scalar()
        if gid is not None:
            conn.execute(sa.text("INSERT INTO grupo_permissao (grupo_id, permissao_id) VALUES (:g, :p)"), {"g": gid, "p": pid})


def downgrade() -> None:
    conn = op.get_bind()
    pid = conn.execute(sa.text("SELECT id FROM permissao WHERE codigo = :c"), {"c": _CODIGO}).scalar()
    if pid is not None:
        conn.execute(sa.text("DELETE FROM usuario_permissao WHERE permissao_id = :p"), {"p": pid})
        conn.execute(sa.text("DELETE FROM grupo_permissao WHERE permissao_id = :p"), {"p": pid})
        conn.execute(sa.text("DELETE FROM permissao WHERE id = :p"), {"p": pid})
    op.drop_table("assistente_log")
    op.drop_table("assistente_mensagem")
    op.drop_table("assistente_conversa")
