"""auditoria da IA: resposta direta passa a ter o status 'sem_consulta' (só dados)

Revision ID: a3d7e9c1f5b2
Revises: f6c2d8a4b1e7
Create Date: 2026-11-24

As linhas 'resposta_direta' (IA respondeu sem acionar ferramenta) estavam com status 'ok' e eram contadas como
"Concluídas". Agora têm status próprio, 'sem_consulta' ("Respondida sem consulta"). As recusas declaradas pela IA
(ferramenta registrar_recusa, status recusa_*) só existem daqui para a frente: as perguntas antigas não são reclassificadas.
"""
from alembic import op

revision = "a3d7e9c1f5b2"
down_revision = "f6c2d8a4b1e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE assistente_log SET status = 'sem_consulta' WHERE ferramenta = 'resposta_direta' AND status = 'ok'")


def downgrade() -> None:
    op.execute("UPDATE assistente_log SET status = 'ok' WHERE ferramenta = 'resposta_direta' AND status = 'sem_consulta'")
