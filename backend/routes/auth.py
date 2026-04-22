from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from pydantic import BaseModel
import bcrypt
from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = "sua_chave_secreta"  # mover para o .env futuramente
ALGORITHM = "HS256"

router = APIRouter(prefix="/auth", tags=["Autenticação"])

class LoginRequest(BaseModel):
    email: str
    senha: str

@router.post("/login")
def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()

    if not usuario or not bcrypt.checkpw(dados.senha.encode("utf-8"), usuario.senha.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    if not usuario.ativo:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    token = jwt.encode({
        "sub": str(usuario.id),
        "nome": usuario.nome,
        "admin": usuario.admin,
        "exp": datetime.utcnow() + timedelta(hours=8)
    }, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer"}