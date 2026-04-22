from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from schemas.usuario import UsuarioCreate, UsuarioUpdate, UsuarioResponse
import bcrypt

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

# Criação de usuário
@router.post("/", response_model=UsuarioResponse)
def criar_usuario(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    existente = db.query(Usuario).filter(Usuario.email == usuario.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    senha_hash = bcrypt.hashpw(usuario.senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    novo = Usuario(
        nome=usuario.nome,
        email=usuario.email,
        senha=senha_hash,
        admin=usuario.admin
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

# Alteração de usuário
@router.put("/{usuario_id}", response_model=UsuarioResponse)
def atualizar_usuario(usuario_id: int, dados: UsuarioUpdate, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.email is not None:
        usuario.email = dados.email
    if dados.senha is not None:
        usuario.senha = bcrypt.hashpw(dados.senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    if dados.admin is not None:
        usuario.admin = dados.admin
    if dados.ativo is not None:
        usuario.ativo = dados.ativo

    db.commit()
    db.refresh(usuario)
    return usuario

# Desativar um usuário
@router.delete("/{usuario_id}")
def desativar_usuario(usuario_id: int, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    usuario.ativo = False
    db.commit()
    db.refresh(usuario)
    return {"message": f"Usuário {usuario.nome} desativado com sucesso"}