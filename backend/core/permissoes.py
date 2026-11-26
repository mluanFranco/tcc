"""Controle de acesso: catálogo de permissões, cálculo das permissões efetivas e dependências das rotas.

Regras:
- cada módulo tem a permissão "ver" (leitura) e "editar" (criar, alterar, cancelar); "editar" já inclui "ver";
- cada cadastro (produtos, categorias, subcategorias, unidades, clientes, fornecedores, formas de pagamento) é um
  módulo próprio com "ver" e "editar". A LEITURA de um cadastro também é liberada a quem usa um módulo que depende dele
  para preencher os formulários (LEITURA_POR_DEPENDENCIA): ex. quem vê vendas lista clientes no pedido de venda,
  mesmo sem acesso à tela de Clientes. Criar e alterar exige sempre o "editar" do próprio cadastro;
- admin tem tudo, sem depender de grupo;
- permissão efetiva = permissões do grupo (se o grupo estiver ativo) + permissões extras do usuário;
- 401 = não autenticado (token inválido, usuário inativo); 403 = autenticado, mas sem permissão.
"""
from typing import Dict, Iterable, List, Set

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.security import get_current_user
from database import get_db
from models import GrupoAcesso, GrupoPermissao, Permissao, Usuario, UsuarioPermissao

# módulo -> (descrição, ações existentes). A ordem aqui é a ordem em que a tela de grupos lista os módulos.
MODULOS: Dict[str, tuple] = {
    "produtos":         ("Cadastro de produtos e insumos (estoque, preços e embalagem)", ("ver", "editar")),
    "categorias":       ("Cadastro de categorias de produto", ("ver", "editar")),
    "subcategorias":    ("Cadastro de subcategorias de produto", ("ver", "editar")),
    "unidades":         ("Cadastro de unidades de medida", ("ver", "editar")),
    "clientes":         ("Cadastro de clientes e seus endereços", ("ver", "editar")),
    "fornecedores":     ("Cadastro de fornecedores e seus endereços", ("ver", "editar")),
    "formas_pagamento": ("Cadastro de formas de pagamento e parcelas", ("ver", "editar")),
    "geladeiras": ("Geladeiras e histórico de manutenção", ("ver", "editar")),
    "vendas":     ("Pedidos de venda (e o PDF do pedido)", ("ver", "editar")),
    "compras":    ("Pedidos de compra (e o PDF do pedido)", ("ver", "editar")),
    "cotacoes":   ("Cotações de compra e de venda (e o PDF da cotação)", ("ver", "editar")),
    "producao":   ("Receitas e ordens de produção", ("ver", "editar")),
    "financeiro": ("Financeiro: títulos a pagar e a receber, baixas e categorias financeiras", ("ver", "editar")),
    "relatorios": ("Relatórios financeiros por período", ("ver",)),
    "assistente": ("Assistente de IA: perguntas em linguagem natural sobre os dados que o usuário já pode ver", ("ver",)),
}
_ROTULO = {"ver": "Visualizar", "editar": "Criar e alterar"}

CODIGOS: List[str] = [f"{m}.{a}" for m, (_, acoes) in MODULOS.items() for a in acoes]

CADASTROS = ("produtos", "categorias", "subcategorias", "unidades", "clientes", "fornecedores", "formas_pagamento")

# Leitura de um cadastro por quem usa um módulo que depende dele (os formulários listam esses dados).
# Ex.: o pedido de venda lista clientes, produtos, unidades e formas de pagamento. Só LEITURA: alterar exige o próprio cadastro.
LEITURA_POR_DEPENDENCIA: Dict[str, tuple] = {
    "produtos":         ("vendas", "compras", "cotacoes", "producao"),
    "categorias":       ("produtos", "subcategorias"),
    "subcategorias":    ("produtos",),
    "unidades":         ("produtos", "vendas", "compras", "cotacoes", "producao"),
    "clientes":         ("vendas", "geladeiras", "financeiro"),          # cotação de venda já exige vendas
    "fornecedores":     ("compras", "geladeiras", "financeiro"),         # cotação de compra já exige compras
    "formas_pagamento": ("vendas", "compras", "cotacoes", "geladeiras"),
}

# grupos padrão (referência; criados pelas migrations e ajustados quando os cadastros se dividiram em módulos)
_OPERACIONAIS = ["geladeiras", "vendas", "compras", "cotacoes", "producao"]
GRUPOS_PADRAO = {
    "Gerência":    ("Acesso a todos os módulos, inclusive financeiro e relatórios", list(CODIGOS)),
    "Operacional": ("Cadastros, geladeiras, vendas, compras, cotações e produção; sem financeiro e relatórios",
                    [f"{c}.editar" for c in CADASTROS] + [f"{m}.editar" for m in _OPERACIONAIS] + ["assistente.ver"]),
    "Consulta":    ("Somente visualização dos módulos operacionais; sem financeiro e relatórios",
                    [f"{c}.ver" for c in CADASTROS] + [f"{m}.ver" for m in _OPERACIONAIS] + ["assistente.ver"]),
}


def descricao_da_permissao(codigo: str) -> str:
    modulo, acao = codigo.split(".")
    return f"{_ROTULO[acao]} — {MODULOS[modulo][0]}"


def codigos_desconhecidos(codigos: Iterable[str]) -> List[str]:
    return sorted({c for c in codigos if c not in CODIGOS})


def normalizar(codigos: Iterable[str]) -> List[str]:
    """Remove repetidos e devolve na ordem do catálogo."""
    pedidos = set(codigos)
    return [c for c in CODIGOS if c in pedidos]


def _permissoes_do_banco(db: Session, usuario: Usuario) -> Set[str]:
    codigos: Set[str] = set()
    if usuario.grupo_id is not None:
        codigos.update(
            c for (c,) in db.query(Permissao.codigo)
            .join(GrupoPermissao, GrupoPermissao.permissao_id == Permissao.id)
            .join(GrupoAcesso, GrupoAcesso.id == GrupoPermissao.grupo_id)
            .filter(GrupoAcesso.id == usuario.grupo_id, GrupoAcesso.ativo == True)  # noqa: E712 (grupo inativo não concede nada)
        )
    codigos.update(
        c for (c,) in db.query(Permissao.codigo)
        .join(UsuarioPermissao, UsuarioPermissao.permissao_id == Permissao.id)
        .filter(UsuarioPermissao.usuario_id == usuario.id)
    )
    return codigos


def permissoes_efetivas(db: Session, usuario: Usuario) -> Set[str]:
    if usuario.admin:
        return set(CODIGOS)
    return _permissoes_do_banco(db, usuario)


def tem_permissao(efetivas: Set[str], codigo: str) -> bool:
    if codigo in efetivas:
        return True
    # quem pode editar um módulo também pode vê-lo
    return codigo.endswith(".ver") and codigo[:-4] + ".editar" in efetivas


def _efetivas_da_requisicao(request: Request, db: Session, usuario: Usuario) -> Set[str]:
    """Calcula uma vez por requisição (a rota pode ter mais de uma dependência de permissão)."""
    cache = getattr(request.state, "permissoes_efetivas", None)
    if cache is None:
        cache = permissoes_efetivas(db, usuario)
        request.state.permissoes_efetivas = cache
    return cache


def _negar(codigo: str):
    raise HTTPException(status_code=403, detail=f"Sem permissão para esta operação (necessária: {codigo})")


def exigir(codigo: str):
    """Dependência para uma rota específica, por exemplo: dependencies=[Depends(exigir("financeiro.ver"))]."""
    if codigo not in CODIGOS:
        raise ValueError(f"Permissão inexistente no catálogo: {codigo}")

    def dependencia(request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
        if not tem_permissao(_efetivas_da_requisicao(request, db, usuario), codigo):
            _negar(codigo)
        return usuario
    return dependencia


def checar_permissao(request: Request, db: Session, usuario: Usuario, codigo: str) -> None:
    """Checagem pontual dentro de uma rota (por exemplo, aprovar cotação também exige editar o módulo do pedido gerado)."""
    if not tem_permissao(_efetivas_da_requisicao(request, db, usuario), codigo):
        _negar(codigo)


# Cotação de compra pertence ao módulo de compras; de venda, ao de vendas. Além de cotacoes.ver/editar, o usuário
# precisa ao menos VER o módulo do tipo (quem edita também vê). Ex.: o grupo Vendas só enxerga cotações de venda.
MODULO_DO_TIPO_COTACAO = {"compra": "compras", "venda": "vendas"}


def tipos_cotacao_permitidos(request: Request, db: Session, usuario: Usuario) -> Set[str]:
    efetivas = _efetivas_da_requisicao(request, db, usuario)
    return {t for t, m in MODULO_DO_TIPO_COTACAO.items() if tem_permissao(efetivas, f"{m}.ver")}


def exigir_tipo_cotacao(request: Request, db: Session, usuario: Usuario, tipo: str, ocultar: bool = True) -> None:
    """Barra o acesso a uma cotação de tipo não permitido. ocultar=True responde 404 (não revela que a cotação existe);
    False responde 403 (ex.: criar uma cotação desse tipo)."""
    if tipo in tipos_cotacao_permitidos(request, db, usuario):
        return
    if ocultar:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    _negar(f"{MODULO_DO_TIPO_COTACAO[tipo]}.ver")


def exigir_modulo(modulo: str):
    """Dependência para um router inteiro: GET/HEAD exigem "<modulo>.ver"; os demais métodos, "<modulo>.editar".
    Quando o módulo não tem a ação (ex.: relatórios só tem "ver"), basta estar logado para ela."""
    if modulo not in MODULOS:
        raise ValueError(f"Módulo inexistente no catálogo: {modulo}")

    def dependencia(request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
        acao = "ver" if request.method in ("GET", "HEAD", "OPTIONS") else "editar"
        codigo = f"{modulo}.{acao}"
        if codigo in CODIGOS and not tem_permissao(_efetivas_da_requisicao(request, db, usuario), codigo):
            _negar(codigo)
        return usuario
    return dependencia


def pode_ler_cadastro(efetivas: Set[str], cadastro: str) -> bool:
    """Vê o cadastro (tela) OU usa um módulo que precisa listá-lo nos formulários."""
    return any(tem_permissao(efetivas, f"{m}.ver") for m in (cadastro,) + LEITURA_POR_DEPENDENCIA.get(cadastro, ()))


def exigir_cadastro(cadastro: str):
    """Dependência dos routers de cadastro: GET/HEAD exigem ver o cadastro ou um módulo que dependa dele;
    criar, alterar e desativar exigem "<cadastro>.editar"."""
    if cadastro not in CADASTROS:
        raise ValueError(f"Cadastro inexistente no catálogo: {cadastro}")

    def dependencia(request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
        efetivas = _efetivas_da_requisicao(request, db, usuario)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            if not pode_ler_cadastro(efetivas, cadastro):
                _negar(f"{cadastro}.ver")
        elif not tem_permissao(efetivas, f"{cadastro}.editar"):
            _negar(f"{cadastro}.editar")
        return usuario
    return dependencia


def exigir_admin(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if not usuario.admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return usuario


def travar_admins_ativos(db: Session) -> List[Usuario]:
    """Trava (SELECT ... FOR UPDATE) os admins ativos: dois admins não conseguem se tirar do ar ao mesmo tempo."""
    return db.query(Usuario).filter(Usuario.admin == True, Usuario.ativo == True).with_for_update().all()  # noqa: E712
