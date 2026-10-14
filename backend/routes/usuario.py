from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from database import get_db
from models import GrupoAcesso, Permissao, Usuario, UsuarioPermissao
from schemas.usuario import (
    UsuarioCreate, UsuarioUpdate, UsuarioResponse, UsuarioMeResponse,
    PermissoesDoUsuarioUpdate, PermissoesDoUsuarioResponse, GrupoResumo,
)
from core.security import get_current_user
from core.permissoes import (
    codigos_desconhecidos, exigir_admin, normalizar, permissoes_efetivas, travar_admins_ativos,
)
from core import foto as fotos
from typing import List, Optional
import bcrypt

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

_bearer_opcional = HTTPBearer(auto_error=False)


def _quem_cadastra(
    credenciais: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_opcional),
    db: Session = Depends(get_db),
):
    """Só admin cadastra usuários. Única exceção: banco sem nenhum usuário (primeiro acesso), para criar o primeiro admin."""
    if db.query(Usuario.id).first() is None:
        return None
    if credenciais is None:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado", headers={"WWW-Authenticate": "Bearer"})
    return exigir_admin(get_current_user(credenciais, db))


def _grupo_utilizavel(db: Session, grupo_id: int) -> GrupoAcesso:
    grupo = db.query(GrupoAcesso).filter(GrupoAcesso.id == grupo_id).first()
    if not grupo:
        raise HTTPException(status_code=400, detail="Grupo de acesso não encontrado")
    if not grupo.ativo:
        raise HTTPException(status_code=400, detail="Grupo de acesso inativo")
    return grupo


def _buscar(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario


def _proteger_acesso(db: Session, alvo: Usuario, quem: Usuario, novo_ativo: Optional[bool], novo_admin: Optional[bool]):
    """Regras de segurança para desativar usuário ou tirar o acesso de administrador (None = não muda)."""
    if quem.id == alvo.id:
        if novo_ativo is False:
            raise HTTPException(status_code=400, detail="Você não pode desativar o seu próprio usuário")
        if alvo.admin and novo_admin is False:
            raise HTTPException(status_code=400, detail="Você não pode remover o seu próprio acesso de administrador")
    deixa_de_ser_admin_ativo = bool(alvo.admin and alvo.ativo) and (novo_ativo is False or novo_admin is False)
    if deixa_de_ser_admin_ativo:
        outros = [a for a in travar_admins_ativos(db) if a.id != alvo.id]
        if not outros:
            raise HTTPException(status_code=400, detail="O sistema precisa de pelo menos um administrador ativo")


def _resumo_grupo(usuario: Usuario) -> Optional[GrupoResumo]:
    return GrupoResumo(id=usuario.grupo.id, nome=usuario.grupo.nome) if usuario.grupo else None


def _extras(db: Session, usuario_id: int) -> List[str]:
    return normalizar(
        c for (c,) in db.query(Permissao.codigo)
        .join(UsuarioPermissao, UsuarioPermissao.permissao_id == Permissao.id)
        .filter(UsuarioPermissao.usuario_id == usuario_id)
    )


def _detalhe_permissoes(db: Session, usuario: Usuario) -> PermissoesDoUsuarioResponse:
    extras = _extras(db, usuario.id)
    do_grupo: List[str] = []
    if usuario.grupo and usuario.grupo.ativo:
        do_grupo = normalizar(p.codigo for p in usuario.grupo.permissoes)
    return PermissoesDoUsuarioResponse(
        admin=bool(usuario.admin), grupo=_resumo_grupo(usuario), do_grupo=do_grupo, extras=extras,
        efetivas=normalizar(permissoes_efetivas(db, usuario)),
    )


def _self_ou_admin(usuario_id: int, quem: Usuario):
    if quem.id != usuario_id and not quem.admin:
        raise HTTPException(status_code=403, detail="Você só pode acessar o seu próprio usuário")


@router.post("/", response_model=UsuarioResponse)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db), quem=Depends(_quem_cadastra)):
    if db.query(Usuario).filter(Usuario.email == dados.email).first():
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    if dados.grupo_id is not None:
        _grupo_utilizavel(db, dados.grupo_id)

    senha_hash = bcrypt.hashpw(dados.senha.encode(), bcrypt.gensalt()).decode()
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        senha_hash=senha_hash,
        admin=True if quem is None else dados.admin,   # o primeiro usuário do sistema é sempre admin
        grupo_id=dados.grupo_id,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/", response_model=List[UsuarioResponse])
def listar_usuarios(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(exigir_admin)
):
    if incluir_inativos:
        return db.query(Usuario).all()
    return db.query(Usuario).filter(Usuario.ativo == True).all()


@router.get("/inativos", response_model=List[UsuarioResponse])
def listar_usuarios_inativos(db: Session = Depends(get_db), _=Depends(exigir_admin)):
    return db.query(Usuario).filter(Usuario.ativo == False).all()


@router.get("/me", response_model=UsuarioMeResponse)
def meu_usuario(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    """Dados do usuário logado e as permissões efetivas: é com isso que o front-end monta menus e botões."""
    d = _detalhe_permissoes(db, usuario)
    return UsuarioMeResponse(
        id=usuario.id, nome=usuario.nome, email=usuario.email, admin=d.admin, grupo=d.grupo,
        foto_url=usuario.foto_url, permissoes=d.efetivas, permissoes_extras=d.extras,
    )


@router.get("/{usuario_id}", response_model=UsuarioResponse)
def buscar_usuario(usuario_id: int, db: Session = Depends(get_db), quem: Usuario = Depends(get_current_user)):
    _self_ou_admin(usuario_id, quem)
    return _buscar(db, usuario_id)


@router.put("/{usuario_id}", response_model=UsuarioResponse)
def atualizar_usuario(usuario_id: int, dados: UsuarioUpdate, db: Session = Depends(get_db), quem: Usuario = Depends(exigir_admin)):
    usuario = _buscar(db, usuario_id)

    _proteger_acesso(db, usuario, quem, dados.ativo, dados.admin)

    if dados.email is not None and dados.email != usuario.email:
        if db.query(Usuario.id).filter(Usuario.email == dados.email, Usuario.id != usuario.id).first():
            raise HTTPException(status_code=400, detail="Email já cadastrado")
        usuario.email = dados.email
    if "grupo_id" in dados.model_fields_set:
        if dados.grupo_id is not None and dados.grupo_id != usuario.grupo_id:
            _grupo_utilizavel(db, dados.grupo_id)
        usuario.grupo_id = dados.grupo_id

    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.senha is not None:
        usuario.senha_hash = bcrypt.hashpw(dados.senha.encode(), bcrypt.gensalt()).decode()
    if dados.admin is not None:
        usuario.admin = dados.admin
    if dados.ativo is not None:
        usuario.ativo = dados.ativo

    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{usuario_id}")
def desativar_usuario(usuario_id: int, db: Session = Depends(get_db), quem: Usuario = Depends(exigir_admin)):
    usuario = _buscar(db, usuario_id)
    _proteger_acesso(db, usuario, quem, novo_ativo=False, novo_admin=None)

    usuario.ativo = False
    db.commit()
    return {"message": f"Usuário {usuario.nome} desativado com sucesso"}


# ---------- permissões extras ----------

@router.get("/{usuario_id}/permissoes", response_model=PermissoesDoUsuarioResponse)
def ver_permissoes_do_usuario(usuario_id: int, db: Session = Depends(get_db), _=Depends(exigir_admin)):
    return _detalhe_permissoes(db, _buscar(db, usuario_id))


@router.put("/{usuario_id}/permissoes", response_model=PermissoesDoUsuarioResponse)
def definir_permissoes_extras(
    usuario_id: int, dados: PermissoesDoUsuarioUpdate, db: Session = Depends(get_db), _=Depends(exigir_admin)
):
    """Substitui as permissões extras do usuário (as que ele tem além do grupo). Lista vazia remove todas."""
    usuario = _buscar(db, usuario_id)
    invalidos = codigos_desconhecidos(dados.permissoes)
    if invalidos:
        raise HTTPException(status_code=400, detail=f"Permissões inexistentes: {', '.join(invalidos)}")
    escolhidas = db.query(Permissao).filter(Permissao.codigo.in_(set(dados.permissoes))).all() if dados.permissoes else []
    db.query(UsuarioPermissao).filter(UsuarioPermissao.usuario_id == usuario.id).delete(synchronize_session=False)
    for p in escolhidas:
        db.add(UsuarioPermissao(usuario_id=usuario.id, permissao_id=p.id))
    db.commit()
    db.refresh(usuario)
    return _detalhe_permissoes(db, usuario)


# ---------- foto ----------

@router.put("/{usuario_id}/foto", response_model=UsuarioResponse)
def enviar_foto(
    usuario_id: int, arquivo: UploadFile = File(...), db: Session = Depends(get_db), quem: Usuario = Depends(get_current_user)
):
    """Troca a foto. JPEG, PNG ou WebP até 2 MB; vira um JPEG quadrado de 256x256. O próprio usuário ou um admin."""
    _self_ou_admin(usuario_id, quem)
    usuario = _buscar(db, usuario_id)
    jpeg = fotos.processar(arquivo.file.read(fotos.TAMANHO_MAXIMO + 1))
    antigo = usuario.foto
    novo = fotos.salvar(usuario.id, jpeg)
    usuario.foto = novo
    try:
        db.commit()
    except Exception:
        db.rollback()
        fotos.remover(novo)
        raise
    fotos.remover(antigo)
    db.refresh(usuario)
    return usuario


@router.get("/{usuario_id}/foto")
def baixar_foto(usuario_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    usuario = _buscar(db, usuario_id)
    caminho = fotos.caminho(usuario.foto)
    if not caminho:
        raise HTTPException(status_code=404, detail="Usuário sem foto")
    # o nome do arquivo muda a cada troca, então o navegador pode guardar a imagem (somente no cache privado dele)
    return FileResponse(caminho, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/{usuario_id}/foto", response_model=UsuarioResponse)
def remover_foto(usuario_id: int, db: Session = Depends(get_db), quem: Usuario = Depends(get_current_user)):
    _self_ou_admin(usuario_id, quem)
    usuario = _buscar(db, usuario_id)
    antigo = usuario.foto
    usuario.foto = None
    db.commit()
    fotos.remover(antigo)
    db.refresh(usuario)
    return usuario
