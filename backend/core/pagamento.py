from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN
from typing import Iterable, List, Dict, Any

_CENTAVO = Decimal("0.01")


def gerar_parcelas(parcelas: Iterable, valor_total, data_base: date) -> List[Dict[str, Any]]:
    """
    Aplica o "molde" de uma forma de pagamento (suas parcelas) a um valor e a uma data base.

    Cada item de `parcelas` precisa ter `numero`, `prazo_dias` e `percentual`.
    Retorna [{"numero", "vencimento", "percentual", "valor"}].

    Como o dinheiro é dividido: as parcelas, exceto a última, são calculadas e TRUNCADAS
    no centavo; a última recebe o que sobrou. Assim a soma das parcelas é sempre exatamente
    o valor total, e nenhuma parcela fica negativa (arredondar para cima poderia deixar a
    última negativa em valores muito pequenos).
    """
    total = Decimal(str(valor_total)).quantize(_CENTAVO)
    ordenadas = sorted(parcelas, key=lambda p: p.numero)

    resultado = []
    acumulado = Decimal("0.00")
    for indice, parcela in enumerate(ordenadas):
        if indice == len(ordenadas) - 1:
            valor = total - acumulado
        else:
            valor = (total * Decimal(parcela.percentual) / Decimal("100")).quantize(_CENTAVO, rounding=ROUND_DOWN)
            acumulado += valor
        resultado.append({
            "numero": parcela.numero,
            "vencimento": data_base + timedelta(days=parcela.prazo_dias),
            "percentual": Decimal(parcela.percentual),
            "valor": valor,
        })
    return resultado


def classificar_forma(parcelas: Iterable) -> str:
    """vista = 1 parcela sem prazo; prazo = 1 parcela com prazo; parcelado = 2 ou mais parcelas."""
    lista = list(parcelas)
    if len(lista) > 1:
        return "parcelado"
    if len(lista) == 1 and lista[0].prazo_dias == 0:
        return "vista"
    return "prazo"
