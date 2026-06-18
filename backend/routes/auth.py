from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from schemas.auth import LoginRequest, TokenResponse
from jose import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
import bcrypt, os

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = os.getenv("ALGORITHM")
EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", 8))

router = APIRouter(prefix="/auth", tags=["Autenticação"])

@router.post("/login", response_model=TokenResponse)
def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()

    if not usuario or not bcrypt.checkpw(dados.senha.encode(), usuario.senha_hash.encode()):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    if not usuario.ativo:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    token = jwt.encode({
        "sub": str(usuario.id),
        "nome": usuario.nome,
        "admin": usuario.admin,
        "exp": datetime.utcnow() + timedelta(hours=EXPIRE_HOURS)
    }, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer"}