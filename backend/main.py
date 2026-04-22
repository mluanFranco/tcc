from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # Para evitar bloqueia de CORS
from routes import usuario, auth

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # em produção, substituir pelo domínio real
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(usuario.router)
app.include_router(auth.router)