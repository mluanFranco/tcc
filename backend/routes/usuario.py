from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from schemas.usuario import UsuarioCreate, UsuarioResponse
import bcrypt

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

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