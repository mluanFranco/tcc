from pydantic import BaseModel, field_validator

from schemas.usuario import _senha_valida   # mesma regra de senha do cadastro de usuários (8 a 72 bytes)


class LoginRequest(BaseModel):
    email: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    senha_nova: str

    _nova = field_validator("senha_nova")(_senha_valida)
