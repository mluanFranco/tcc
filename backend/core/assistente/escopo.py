"""Defesa nº 4: a IA só consulta o que o usuário que perguntou já poderia ver nas telas.
Cada view pertence a um módulo; é preciso a permissão '<módulo>.ver' (quem tem '.editar' também passa).
Algumas exigem dois módulos juntos (cotações de compra: cotacoes + compras; de venda: cotacoes + vendas).
Cadastros (produtos, clientes, fornecedores) são de leitura livre, como nas rotas."""
from typing import Iterable, List, Set

from core.assistente.esquema import VIEWS
from core.permissoes import tem_permissao


class ErroEscopo(Exception):
    """O usuário não tem permissão para os dados dessa consulta. A mensagem é segura para ir à IA e ao usuário."""


def views_permitidas(efetivas: Set[str]) -> List[str]:
    return [n for n, v in VIEWS.items() if all(tem_permissao(efetivas, f"{m}.ver") for m in v.modulos)]


def verificar(views_usadas: Iterable[str], efetivas: Set[str]) -> None:
    faltando = sorted({m for n in views_usadas for m in VIEWS[n].modulos if not tem_permissao(efetivas, f"{m}.ver")})
    if faltando:
        pedidas = ", ".join(f"{m}.ver" for m in faltando)
        raise ErroEscopo(f"Você não tem permissão para consultar estes dados (necessária: {pedidas}).")
