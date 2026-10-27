from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Dict
from sqlalchemy.orm import Session
from models import Produto

_TRES_CASAS = Decimal("0.001")


def quantidade_base(quantidade, fator) -> Decimal:
    """
    Converte a quantidade de um item (na embalagem do produto) para a unidade base do estoque:
    2 potes x fator 5 = 10 L. Produto sem embalagem tem fator 1 e nada muda.
    É o ÚNICO lugar onde a conversão acontece: todo movimento de estoque de pedido passa por aqui.
    """
    return (Decimal(quantidade) * Decimal(fator or 1)).quantize(_TRES_CASAS, rounding=ROUND_HALF_UP)


def travar_produtos(db: Session, ids: Iterable[int]) -> Dict[int, Produto]:
    """
    Busca os produtos já TRAVANDO as linhas (SELECT ... FOR UPDATE) até o fim da
    transação (commit ou rollback). Enquanto uma requisição está mexendo no estoque
    de um produto, outra requisição que queira mexer no mesmo produto espera a sua vez
    e depois enxerga o saldo já atualizado — é isso que impede dois pedidos simultâneos
    de venderem a mesma última unidade.

    As linhas são sempre travadas em ordem crescente de id: com todas as rotas seguindo
    a mesma ordem, duas requisições nunca ficam esperando uma pela outra (deadlock).

    Retorna um dicionário {produto_id: Produto}; ids que não existem simplesmente
    não aparecem nele (quem chama decide devolver 404).
    """
    ids_ordenados = sorted(set(ids))
    if not ids_ordenados:
        return {}

    produtos = (
        db.query(Produto)
        .filter(Produto.id.in_(ids_ordenados))
        .order_by(Produto.id)
        .with_for_update()
        .populate_existing()   # garante o saldo atual do banco, não um valor em cache da sessão
        .all()
    )
    return {p.id: p for p in produtos}
