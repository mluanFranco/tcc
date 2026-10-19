"""Controle de acesso: catálogo de permissões, cálculo das permissões efetivas e dependências das rotas.

Regras:
- cada módulo tem a permissão "ver" (leitura) e "editar" (criar, alterar, cancelar); "editar" já inclui "ver";
- o módulo "cadastros" só tem "editar": a leitura dos cadastros é liberada a qualquer usuário logado,
  porque as telas de venda, compra e produção precisam listar produtos, clientes e fornecedores;
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
    "cadastros":  ("Cadastros: produtos, categorias, subcategorias, unidades de medida, clientes, fornecedores e formas de pagamento", ("editar",)),
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

# grupos criados pela migration (nome -> descrição, permissões)
_OPERACIONAIS = ["geladeiras", "vendas", "compras", "cotacoes", "producao"]
GRUPOS_PADRAO = {  # o assistente (assistente.ver) entra nos três grupos pela migration b6e1a9d3c7f2
    "Gerência":    ("Acesso a todos os módulos, inclusive financeiro e relatórios", list(CODIGOS)),
    "Operacional": ("Cadastros, geladeiras, vendas, compras, cotações e produção; sem financeiro e relatórios",
                    ["cadastros.editar"] + [f"{m}.editar" for m in _OPERACIONAIS] + ["assistente.ver"]),
    "Consulta":    ("Somente visualização dos módulos operacionais; sem financeiro e relatórios",
                    [f"{m}.ver" for m in _OPERACIONAIS] + ["assistente.ver"]),
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


def exigir_modulo(modulo: str):
    """Dependência para um router inteiro: GET/HEAD exigem "<modulo>.ver"; os demais métodos, "<modulo>.editar".
    Quando o módulo não tem a ação (cadastros não tem "ver"), basta estar logado."""
    if modulo not in MODULOS:
        raise ValueError(f"Módulo inexistente no catálogo: {modulo}")

    def dependencia(request: Request, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
        acao = "ver" if request.method in ("GET", "HEAD", "OPTIONS") else "editar"
        codigo = f"{modulo}.{acao}"
        if codigo in CODIGOS and not tem_permissao(_efetivas_da_requisicao(request, db, usuario), codigo):
            _negar(codigo)
        return usuario
    return dependencia


def exigir_admin(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    if not usuario.admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return usuario


def travar_admins_ativos(db: Session) -> List[Usuario]:
    """Trava (SELECT ... FOR UPDATE) os admins ativos: dois admins não conseguem se tirar do ar ao mesmo tempo."""
    return db.query(Usuario).filter(Usuario.admin == True, Usuario.ativo == True).with_for_update().all()  # noqa: E712
