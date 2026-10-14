from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import (
    auth, usuario, produto, cliente, fornecedor,
    forma_pagamento, pedido_venda, pedido_compra,
    cotacao, geladeira, historico_manutencao,
    categoria, subcategoria, unidade_medida, receita, ordem_producao, financeiro, categoria_financeira, relatorios, pdf, grupo_acesso
)
from core.permissoes import exigir_modulo

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
app.include_router(grupo_acesso.router)

# Permissão por módulo (core/permissoes.py): GET exige "<módulo>.ver" e os demais métodos "<módulo>.editar".
# Cadastros: a leitura é liberada a qualquer usuário logado; só a escrita exige "cadastros.editar".
app.include_router(produto.router,             dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(cliente.router,             dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(fornecedor.router,          dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(forma_pagamento.router,     dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(categoria.router,           dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(subcategoria.router,        dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(unidade_medida.router,      dependencies=[Depends(exigir_modulo("cadastros"))])
app.include_router(geladeira.router,           dependencies=[Depends(exigir_modulo("geladeiras"))])
app.include_router(historico_manutencao.router, dependencies=[Depends(exigir_modulo("geladeiras"))])
app.include_router(pedido_venda.router,        dependencies=[Depends(exigir_modulo("vendas"))])
app.include_router(pedido_compra.router,       dependencies=[Depends(exigir_modulo("compras"))])
app.include_router(cotacao.router,             dependencies=[Depends(exigir_modulo("cotacoes"))])
app.include_router(receita.router,             dependencies=[Depends(exigir_modulo("producao"))])
app.include_router(ordem_producao.router,      dependencies=[Depends(exigir_modulo("producao"))])
app.include_router(financeiro.router,          dependencies=[Depends(exigir_modulo("financeiro"))])
app.include_router(categoria_financeira.router, dependencies=[Depends(exigir_modulo("financeiro"))])
app.include_router(relatorios.router,          dependencies=[Depends(exigir_modulo("relatorios"))])
app.include_router(pdf.router)   # cada rota de PDF declara a permissão do seu documento
