"""auditoria da IA: registra também as perguntas respondidas sem ferramenta (só dados)

Revision ID: f6c2d8a4b1e7
Revises: e1b7c4a9f2d6
Create Date: 2026-11-24

Até aqui o assistente_log só tinha linha quando a IA acionava uma ferramenta (ou o provedor falhava): recusas e
respostas sem consulta não apareciam na auditoria. O código novo grava ferramenta='resposta_direta'; esta migration
cria essas linhas para as perguntas antigas. A pergunta é ligada à resposta que veio logo depois dela na mesma
conversa; a data e a duração são as da resposta. Não muda nenhuma estrutura.
"""
from alembic import op

revision = "f6c2d8a4b1e7"
down_revision = "e1b7c4a9f2d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO assistente_log (usuario_id, conversa_id, mensagem_id, pergunta, ferramenta, status, duracao_ms, created_at)
        SELECT c.usuario_id, u.conversa_id, r.id, LEFT(u.conteudo, 500), 'resposta_direta', 'sem_consulta', r.duracao_ms, r.created_at
        FROM assistente_mensagem u
        JOIN assistente_conversa c ON c.id = u.conversa_id
        JOIN assistente_mensagem r ON r.id = (SELECT MIN(x.id) FROM assistente_mensagem x
                                              WHERE x.conversa_id = u.conversa_id AND x.id > u.id)
        WHERE u.papel = 'usuario' AND r.papel = 'assistente'
          AND NOT EXISTS (SELECT 1 FROM assistente_log l WHERE l.mensagem_id = r.id)
        ORDER BY u.id
    """)


def downgrade() -> None:
    # as linhas criadas são registros de auditoria válidos; não são apagadas (o código antigo só não as filtra por nome)
    pass
