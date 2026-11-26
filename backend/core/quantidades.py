"""Unidades inteiras x fracionáveis (unidade_medida.fracionavel).

Em unidade inteira (un, pote, caixa...) não existe 1,5: toda quantidade digitada nessa unidade precisa ser inteira,
e o consumo calculado pela receita é arredondado PARA CIMA até a unidade (1,4 pote vira 2).
É o único lugar com essa regra: rotas e cálculos chamam estas funções."""
from decimal import Decimal, ROUND_CEILING
from typing import Optional

from fastapi import HTTPException


def e_inteira(unidade) -> bool:
    """True se a unidade NÃO aceita fração. Sem unidade (None) = fracionável."""
    return unidade is not None and not getattr(unidade, "fracionavel", True)


def tem_fracao(valor) -> bool:
    v = Decimal(str(valor))
    return v != v.to_integral_value()


def unidade_negociacao(produto):
    """Unidade em que pedidos e cotações são digitados: a embalagem, ou a base se não houver embalagem."""
    return produto.embalagem_unidade if produto.embalagem_unidade_id else produto.unidade_medida


def _formatar(valor) -> str:
    return f"{Decimal(str(valor)).normalize():f}".replace(".", ",")


def exigir_inteiro(valor, unidade, descricao: str) -> None:
    """400 se `valor` tiver casas decimais e a unidade for inteira. `descricao` diz de onde veio (ex.: "Quantidade de 'Pote 5 L'")."""
    if valor is None or not e_inteira(unidade):
        return
    if tem_fracao(valor):
        raise HTTPException(
            status_code=400,
            detail=f"{descricao}: a unidade '{unidade.nome}' ({unidade.sigla}) não aceita quantidade fracionada "
                   f"(informado {_formatar(valor)}). Use um número inteiro.",
        )


def arredondar_consumo(valor: Decimal, unidade) -> Decimal:
    """Consumo calculado (já com 3 casas): em unidade inteira, sobe até o próximo inteiro (nunca consome a menos)."""
    if not e_inteira(unidade):
        return valor
    return Decimal(valor).to_integral_value(rounding=ROUND_CEILING).quantize(Decimal("0.001"))
