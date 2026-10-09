from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import (
    auth, usuario, produto, cliente, fornecedor,
    forma_pagamento, pedido_venda, pedido_compra,
    cotacao, geladeira, historico_manutencao,
    categoria, subcategoria, unidade_medida, receita
)

app = FastAPI(
    title="Sistema de Gestão de Estoque - Nova Sorvetes",
    version="1.0.1"
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
app.include_router(forma_pagamento.router)
app.include_router(pedido_venda.router)
app.include_router(pedido_compra.router)
app.include_router(cotacao.router)
app.include_router(geladeira.router)
app.include_router(historico_manutencao.router)
app.include_router(categoria.router)
app.include_router(subcategoria.router)
app.include_router(unidade_medida.router)
app.include_router(receita.router)