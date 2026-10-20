from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Usuario
from schemas.auth import LoginRequest, TokenResponse, AlterarSenhaRequest
from core.security import get_current_user
from jose import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
import bcrypt, os

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = os.getenv("ALGORITHM")
EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", 8))

router = APIRouter(prefix="/auth", tags=["Autenticação"])


def _confere_senha(senha: str, senha_hash: str) -> bool:
    """bcrypt.checkpw, mas senha com mais de 72 bytes (que nunca foi aceita no cadastro) vira "não confere" em vez de erro 500."""
    try:
        return bcrypt.checkpw(senha.encode(), senha_hash.encode())
    except ValueError:
        return False


def _emitir_token(usuario: Usuario, agora: datetime) -> str:
    """JWT com o instante de emissão ("iat"): é ele que permite recusar sessões antigas depois de uma troca de senha."""
    return jwt.encode({
        "sub": str(usuario.id),
        "nome": usuario.nome,
        "admin": usuario.admin,
        "iat": agora,
        "exp": agora + timedelta(hours=EXPIRE_HOURS)
    }, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/login", response_model=TokenResponse)
def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()

    if not usuario or not _confere_senha(dados.senha, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    if not usuario.ativo:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    return {"access_token": _emitir_token(usuario, datetime.utcnow()), "token_type": "bearer"}


@router.put("/senha", response_model=TokenResponse)
def alterar_senha(dados: AlterarSenhaRequest, db: Session = Depends(get_db), logado: Usuario = Depends(get_current_user)):
    """O próprio usuário troca a senha: exige a senha atual e encerra as outras sessões (tokens antigos deixam de valer).
    Devolve um token novo para a sessão atual continuar sem novo login.
    Erro de senha atual é 400 (e não 401), porque 401 no front-end significa "sessão expirada"."""
    usuario = (db.query(Usuario).filter(Usuario.id == logado.id)
               .with_for_update().populate_existing().first())   # duas trocas ao mesmo tempo passam uma de cada vez

    if not _confere_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if _confere_senha(dados.senha_nova, usuario.senha_hash):
        raise HTTPException(status_code=400, detail="A nova senha deve ser diferente da atual")

    agora = datetime.utcnow()
    usuario.senha_hash = bcrypt.hashpw(dados.senha_nova.encode(), bcrypt.gensalt()).decode()
    usuario.senha_alterada_em = agora
    db.commit()

    return {"access_token": _emitir_token(usuario, agora), "token_type": "bearer"}
