from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, usuario, produto, cliente, fornecedor

app = FastAPI(
    title="Sistema de Gestão de Estoque - Nova Sorvetes",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(usuario.router)
app.include_router(produto.router)
app.include_router(cliente.router)
app.include_router(fornecedor.router)