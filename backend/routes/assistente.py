import json
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.assistente import config, orquestrador
from core.assistente.provedor import ErroProvedor, Provedor
from core.permissoes import _efetivas_da_requisicao, exigir, exigir_admin
from core.security import get_current_user
from database import get_db
from models import AssistenteConversa, AssistenteLog, AssistenteMensagem, Usuario
from schemas.assistente import (
    AuditoriaResponse, ConversaDetalheResponse, ConversaResponse, LogResponse, MensagemCreate, MensagemHistorico,
    MensagemResponse, StatusResponse, TabelaResponse,
)

# Quem tem "assistente.ver" usa o assistente; o que ele enxerga é limitado, view por view, pelas permissões do próprio usuário.
router = APIRouter(prefix="/assistente", tags=["Assistente de IA"], dependencies=[Depends(exigir("assistente.ver"))])

MAX_HISTORICO = 10        # mensagens anteriores enviadas ao modelo
MAX_SQL_NO_HISTORICO = 600


def get_provedor() -> Provedor:
    """Dependência trocável nos testes (app.dependency_overrides[get_provedor] = lambda: ProvedorFalso(...))."""
    if not config.habilitado():
        raise HTTPException(status_code=503, detail="O assistente de IA não está configurado (defina GEMINI_API_KEY no .env).")
    from core.assistente.provedor_gemini import ProvedorGemini
    try:
        return ProvedorGemini()
    except ImportError:
        raise HTTPException(status_code=503, detail="Biblioteca do Gemini não instalada (pip install google-genai).")


def _usadas_na_ultima_hora(db: Session, usuario_id: int):
    corte = datetime.now() - timedelta(hours=1)
    q = (db.query(AssistenteMensagem.created_at)
         .join(AssistenteConversa, AssistenteConversa.id == AssistenteMensagem.conversa_id)
         .filter(AssistenteConversa.usuario_id == usuario_id, AssistenteMensagem.papel == "usuario", AssistenteMensagem.created_at >= corte)
         .order_by(AssistenteMensagem.created_at))
    return [c for (c,) in q.all()]


def _tabela(texto: Optional[str]):
    return TabelaResponse(**json.loads(texto)) if texto else None


def _conversa_do_usuario(db: Session, conversa_id: int, usuario: Usuario) -> AssistenteConversa:
    c = db.query(AssistenteConversa).filter(AssistenteConversa.id == conversa_id, AssistenteConversa.usuario_id == usuario.id,
                                            AssistenteConversa.ativa == True).first()  # noqa: E712
    if not c:   # conversa de outra pessoa também é 404: não revela que existe
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return c


@router.get("/status", response_model=StatusResponse)
def status(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    usadas = len(_usadas_na_ultima_hora(db, usuario.id))
    return StatusResponse(habilitado=config.habilitado(), modelo=config.modelo() if config.habilitado() else None,
                          modo_privado=config.modo_privado(), banco_configurado=config.banco_ia_configurado(),
                          limite_por_hora=config.limite_por_hora(), restantes_na_hora=max(0, config.limite_por_hora() - usadas))


@router.post("/mensagens", response_model=MensagemResponse)
def perguntar(dados: MensagemCreate, request: Request, db: Session = Depends(get_db),
              usuario: Usuario = Depends(get_current_user), provedor: Provedor = Depends(get_provedor)):
    limite = config.limite_por_hora()
    usadas = _usadas_na_ultima_hora(db, usuario.id)
    if len(usadas) >= limite:
        liberar = usadas[0] + timedelta(hours=1)
        raise HTTPException(status_code=429, detail=f"Limite de {limite} perguntas por hora atingido. Tente novamente às {liberar.strftime('%H:%M')}.")

    if dados.conversa_id is not None:
        conversa = _conversa_do_usuario(db, dados.conversa_id, usuario)
    else:
        conversa = AssistenteConversa(usuario_id=usuario.id, titulo=" ".join(dados.texto.split())[:60])
        db.add(conversa)
        db.flush()

    # histórico (só texto) ANTES da pergunta nova; nas respostas anteriores vai junto o último SQL usado, para perguntas de continuação
    anteriores = (db.query(AssistenteMensagem).filter(AssistenteMensagem.conversa_id == conversa.id)
                  .order_by(AssistenteMensagem.id.desc()).limit(MAX_HISTORICO).all())[::-1]
    historico = []
    for m in anteriores:
        texto = m.conteudo
        if m.papel == "assistente" and m.consultas:
            sqls = json.loads(m.consultas)
            if sqls:
                texto += f"\n[SQL usado: {sqls[-1][:MAX_SQL_NO_HISTORICO]}]"
        historico.append((m.papel, texto))

    db.add(AssistenteMensagem(conversa_id=conversa.id, papel="usuario", conteudo=dados.texto))
    db.commit()    # a pergunta fica registrada (e conta no limite) mesmo que o provedor falhe
    db.refresh(conversa)

    def gravar_logs(logs, mensagem_id=None):
        for l in logs:
            db.add(AssistenteLog(usuario_id=usuario.id, conversa_id=conversa.id, mensagem_id=mensagem_id, pergunta=dados.texto[:500], **l))

    efetivas = _efetivas_da_requisicao(request, db, usuario)
    try:
        saida = orquestrador.responder(db, efetivas, dados.texto, historico, provedor)
    except ErroProvedor as e:
        db.rollback()
        gravar_logs(getattr(e, "logs", []))
        db.add(AssistenteLog(usuario_id=usuario.id, conversa_id=conversa.id, pergunta=dados.texto[:500], ferramenta="provedor",
                             status="erro_provedor", erro=e.mensagem[:255]))
        db.commit()
        raise HTTPException(status_code=503 if e.temporario else 502, detail=e.mensagem)

    msg = AssistenteMensagem(
        conversa_id=conversa.id, papel="assistente", conteudo=saida.texto,
        tabela=json.dumps(saida.tabela, ensure_ascii=False, default=str) if saida.tabela else None,
        consultas=json.dumps(saida.consultas, ensure_ascii=False) if saida.consultas else None,
        tokens_entrada=saida.uso.entrada, tokens_saida=saida.uso.saida, duracao_ms=saida.duracao_ms)
    db.add(msg)
    db.flush()
    gravar_logs(saida.logs, msg.id)
    conversa.updated_at = datetime.now()
    db.commit()
    return MensagemResponse(conversa_id=conversa.id, mensagem_id=msg.id, resposta=saida.texto, tabela=saida.tabela,
                            consultas=saida.consultas, restantes_na_hora=max(0, limite - len(usadas) - 1))


@router.get("/conversas", response_model=list[ConversaResponse])
def listar_conversas(limite: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    return (db.query(AssistenteConversa).filter(AssistenteConversa.usuario_id == usuario.id, AssistenteConversa.ativa == True)  # noqa: E712
            .order_by(AssistenteConversa.updated_at.desc(), AssistenteConversa.id.desc()).limit(limite).all())


@router.get("/conversas/{conversa_id}", response_model=ConversaDetalheResponse)
def ver_conversa(conversa_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    c = _conversa_do_usuario(db, conversa_id, usuario)
    return ConversaDetalheResponse(
        id=c.id, titulo=c.titulo, created_at=c.created_at, updated_at=c.updated_at,
        mensagens=[MensagemHistorico(id=m.id, papel=m.papel, conteudo=m.conteudo, tabela=_tabela(m.tabela),
                                     consultas=json.loads(m.consultas) if m.consultas else [], created_at=m.created_at) for m in c.mensagens])


@router.delete("/conversas/{conversa_id}")
def excluir_conversa(conversa_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    """Some da lista do usuário (exclusão lógica): o histórico continua valendo para o limite por hora e para a auditoria."""
    c = _conversa_do_usuario(db, conversa_id, usuario)
    c.ativa = False
    db.commit()
    return {"mensagem": "Conversa excluída"}


@router.get("/auditoria", response_model=AuditoriaResponse, dependencies=[Depends(exigir_admin)])
def auditoria(usuario_id: Optional[int] = None, status: Optional[str] = None, ferramenta: Optional[str] = None,
              data_inicio: Optional[date] = None, data_fim: Optional[date] = None,
              limite: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    """Só administrador: quem perguntou o quê, qual SQL/relatório a IA acionou, com que resultado e em quanto tempo."""
    q = db.query(AssistenteLog, Usuario.nome).join(Usuario, Usuario.id == AssistenteLog.usuario_id)
    if usuario_id is not None:
        q = q.filter(AssistenteLog.usuario_id == usuario_id)
    if status:
        q = q.filter(AssistenteLog.status == status)
    if ferramenta:
        q = q.filter(AssistenteLog.ferramenta == ferramenta)
    if data_inicio:
        q = q.filter(AssistenteLog.created_at >= datetime.combine(data_inicio, time.min))
    if data_fim:
        q = q.filter(AssistenteLog.created_at < datetime.combine(data_fim + timedelta(days=1), time.min))
    total = q.count()
    linhas = q.order_by(AssistenteLog.id.desc()).offset(offset).limit(limite).all()
    itens = [LogResponse(id=l.id, usuario_id=l.usuario_id, usuario_nome=nome, conversa_id=l.conversa_id, pergunta=l.pergunta,
                         ferramenta=l.ferramenta, entrada=l.entrada, views=l.views, status=l.status, linhas=l.linhas,
                         duracao_ms=l.duracao_ms, erro=l.erro, created_at=l.created_at) for l, nome in linhas]
    return AuditoriaResponse(total=total, itens=itens)
