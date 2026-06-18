from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from schemas.usuario import UsuarioCreate, UsuarioUpdate, UsuarioResponse
from core.security import get_current_user, get_admin_user
from typing import List
import bcrypt

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

@router.post("/", response_model=UsuarioResponse)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(Usuario).filter(Usuario.email == dados.email).first():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    senha_hash = bcrypt.hashpw(dados.senha.encode(), bcrypt.gensalt()).decode()
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        senha_hash=senha_hash,
        admin=dados.admin
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario

@router.get("/", response_model=List[UsuarioResponse])
def listar_usuarios(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_admin_user)
):
    if incluir_inativos:
        return db.query(Usuario).all()
    return db.query(Usuario).filter(Usuario.ativo == True).all()

@router.get("/inativos", response_model=List[UsuarioResponse])
def listar_usuarios_inativos(db: Session = Depends(get_db), _=Depends(get_admin_user)):
    return db.query(Usuario).filter(Usuario.ativo == False).all()

@router.get("/{usuario_id}", response_model=UsuarioResponse)
def buscar_usuario(usuario_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

@router.put("/{usuario_id}", response_model=UsuarioResponse)
def atualizar_usuario(usuario_id: int, dados: UsuarioUpdate, db: Session = Depends(get_db), _=Depends(get_admin_user)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.email is not None:
        usuario.email = dados.email
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
def desativar_usuario(usuario_id: int, db: Session = Depends(get_db), _=Depends(get_admin_user)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    usuario.ativo = False
    db.commit()
    return {"message": f"Usuário {usuario.nome} desativado com sucesso"}