from decimal import Decimal, ROUND_CEILING
from typing import List, Tuple
from models import Receita

_TRES_CASAS = Decimal("0.001")


def calcular_consumo(receita: Receita, quantidade: Decimal) -> List[Tuple[int, Decimal]]:
    """
    Quanto de cada insumo é consumido para produzir `quantidade` do produto da receita:
        consumo = quantidade_do_item * (quantidade / rendimento)

    Retorna [(produto_id_do_insumo, consumo)]. O resultado é arredondado PARA CIMA na
    3ª casa decimal (a mesma precisão do estoque): na dúvida, consome-se um milésimo a mais
    em vez de a menos, então o estoque nunca fica "maior" do que a realidade.

    É usada tanto pela simulação (Receita) quanto, depois, pela ordem de produção,
    para os dois sempre darem exatamente o mesmo número.
    """
    quantidade = Decimal(quantidade)
    rendimento = Decimal(receita.rendimento)
    fator = quantidade / rendimento
    return [
        (item.produto_id, (Decimal(item.quantidade) * fator).quantize(_TRES_CASAS, rounding=ROUND_CEILING))
        for item in receita.itens
    ]
