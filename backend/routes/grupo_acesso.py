from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import GrupoAcesso, Permissao, Usuario
from schemas.grupo_acesso import (
    GrupoAcessoCreate, GrupoAcessoUpdate, GrupoAcessoResponse, ModuloPermissoes, PermissaoResponse,
)
from core.permissoes import MODULOS, codigos_desconhecidos, exigir_admin, normalizar

# Toda a gestão de acesso é exclusiva de administrador.
router = APIRouter(prefix="/grupos-acesso", tags=["Grupos de Acesso"], dependencies=[Depends(exigir_admin)])


def _resposta(db: Session, g: GrupoAcesso) -> GrupoAcessoResponse:
    ativos = db.query(func.count(Usuario.id)).filter(Usuario.grupo_id == g.id, Usuario.ativo == True).scalar()  # noqa: E712
    return GrupoAcessoResponse(
        id=g.id, nome=g.nome, descricao=g.descricao, ativo=g.ativo,
        permissoes=normalizar(p.codigo for p in g.permissoes), total_usuarios=ativos or 0, created_at=g.created_at,
    )


def _buscar(db: Session, grupo_id: int) -> GrupoAcesso:
    g = db.query(GrupoAcesso).filter(GrupoAcesso.id == grupo_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo de acesso não encontrado")
    return g


def _permissoes(db: Session, codigos: List[str]) -> List[Permissao]:
    invalidos = codigos_desconhecidos(codigos)
    if invalidos:
        raise HTTPException(status_code=400, detail=f"Permissões inexistentes: {', '.join(invalidos)}")
    if not codigos:
        return []
    return db.query(Permissao).filter(Permissao.codigo.in_(set(codigos))).order_by(Permissao.id).all()


def _nome_livre(db: Session, nome: str, ignorar_id: int = None):
    # nome duplicado é proibido mesmo se o grupo existente estiver inativo (mesma regra dos demais cadastros)
    q = db.query(GrupoAcesso.id).filter(func.lower(GrupoAcesso.nome) == nome.lower())
    if ignorar_id is not None:
        q = q.filter(GrupoAcesso.id != ignorar_id)
    if q.first():
        raise HTTPException(status_code=400, detail="Já existe um grupo de acesso com esse nome")


def _exigir_sem_usuarios_ativos(db: Session, g: GrupoAcesso):
    ativos = db.query(func.count(Usuario.id)).filter(Usuario.grupo_id == g.id, Usuario.ativo == True).scalar()  # noqa: E712
    if ativos:
        raise HTTPException(
            status_code=400,
            detail=f"O grupo tem {ativos} usuário(s) ativo(s). Mude-os de grupo antes de desativar o grupo",
        )


@router.get("/permissoes", response_model=List[ModuloPermissoes])
def catalogo_de_permissoes(db: Session = Depends(get_db)):
    """Todas as permissões que existem, agrupadas por módulo: é a lista de checkboxes da tela de grupos."""
    por_codigo = {p.codigo: p for p in db.query(Permissao).all()}
    saida = []
    for modulo, (descricao, acoes) in MODULOS.items():
        itens = [por_codigo[f"{modulo}.{a}"] for a in acoes if f"{modulo}.{a}" in por_codigo]
        saida.append(ModuloPermissoes(
            modulo=modulo, descricao=descricao,
            permissoes=[PermissaoResponse(codigo=p.codigo, modulo=p.modulo, acao=p.acao, descricao=p.descricao) for p in itens],
        ))
    return saida


@router.post("/", response_model=GrupoAcessoResponse)
def criar_grupo(dados: GrupoAcessoCreate, db: Session = Depends(get_db)):
    _nome_livre(db, dados.nome)
    grupo = GrupoAcesso(nome=dados.nome, descricao=dados.descricao, ativo=True, permissoes=_permissoes(db, dados.permissoes))
    db.add(grupo)
    db.commit()
    db.refresh(grupo)
    return _resposta(db, grupo)


@router.get("/", response_model=List[GrupoAcessoResponse])
def listar_grupos(incluir_inativos: bool = False, db: Session = Depends(get_db)):
    q = db.query(GrupoAcesso).order_by(GrupoAcesso.nome)
    if not incluir_inativos:
        q = q.filter(GrupoAcesso.ativo == True)  # noqa: E712
    return [_resposta(db, g) for g in q.all()]


@router.get("/{grupo_id}", response_model=GrupoAcessoResponse)
def buscar_grupo(grupo_id: int, db: Session = Depends(get_db)):
    return _resposta(db, _buscar(db, grupo_id))


@router.put("/{grupo_id}", response_model=GrupoAcessoResponse)
def atualizar_grupo(grupo_id: int, dados: GrupoAcessoUpdate, db: Session = Depends(get_db)):
    grupo = _buscar(db, grupo_id)
    if dados.nome is not None and dados.nome.lower() != grupo.nome.lower():
        _nome_livre(db, dados.nome, ignorar_id=grupo.id)
    if dados.ativo is False and grupo.ativo:
        _exigir_sem_usuarios_ativos(db, grupo)
    if dados.permissoes is not None:
        grupo.permissoes = _permissoes(db, dados.permissoes)
    if dados.nome is not None:
        grupo.nome = dados.nome
    if "descricao" in dados.model_fields_set:
        grupo.descricao = dados.descricao
    if dados.ativo is not None:
        grupo.ativo = dados.ativo
    db.commit()
    db.refresh(grupo)
    return _resposta(db, grupo)


@router.delete("/{grupo_id}")
def desativar_grupo(grupo_id: int, db: Session = Depends(get_db)):
    grupo = _buscar(db, grupo_id)
    if grupo.ativo:
        _exigir_sem_usuarios_ativos(db, grupo)
    grupo.ativo = False
    db.commit()
    return {"message": f"Grupo {grupo.nome} desativado com sucesso"}
