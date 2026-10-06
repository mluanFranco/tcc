"""Funções de validação e normalização compartilhadas pelos schemas.

Ficam em um único lugar para Cliente, Fornecedor e Endereço seguirem exatamente
as mesmas regras (CPF/CNPJ, CEP, UF, DDD).
"""
import re
from typing import Optional

_MASCARA_DOCUMENTO = re.compile(r"[.\-/\s]")


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------

def limpar_texto(valor):
    """Remove espaços das pontas. Qualquer valor que não seja texto passa direto."""
    return valor.strip() if isinstance(valor, str) else valor


# ---------------------------------------------------------------------------
# CPF / CNPJ
# ---------------------------------------------------------------------------

def normalizar_documento(valor: str) -> str:
    """Tira pontos, traços, barras e espaços; letras ficam maiúsculas.

    '12.345.678/0001-95' -> '12345678000195'   |   '12.abc.345/01de-35' -> '12ABC34501DE35'
    """
    return _MASCARA_DOCUMENTO.sub("", valor or "").upper()


def cpf_valido(cpf: str) -> bool:
    if not re.fullmatch(r"\d{11}", cpf) or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(cpf[j]) * (i + 1 - j) for j in range(i))
        digito = (soma * 10) % 11
        if digito == 10:
            digito = 0
        if digito != int(cpf[i]):
            return False
    return True


def _digito_cnpj(base: str) -> int:
    # Módulo 11, pesos de 2 a 9 da direita para a esquerda. Cada caractere vale
    # (código ASCII - 48): '0'..'9' valem 0..9 e 'A'..'Z' valem 17..42, regra do
    # CNPJ alfanumérico da Receita Federal (julho/2026). CNPJs só com números
    # continuam sendo calculados exatamente como antes.
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    soma = sum((ord(ch) - 48) * pesos[pos % 8] for pos, ch in enumerate(reversed(base)))
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def cnpj_valido(cnpj: str) -> bool:
    # 12 primeiras posições aceitam números e letras; os 2 dígitos finais são números.
    if not re.fullmatch(r"[0-9A-Z]{12}\d{2}", cnpj) or cnpj == cnpj[0] * 14:
        return False
    d1 = _digito_cnpj(cnpj[:12])
    d2 = _digito_cnpj(cnpj[:12] + str(d1))
    return cnpj[12:] == f"{d1}{d2}"


def tipo_do_documento(documento: str) -> Optional[str]:
    """Devolve 'PF' (CPF válido), 'PJ' (CNPJ válido) ou None (documento inválido)."""
    if cpf_valido(documento):
        return "PF"
    if cnpj_valido(documento):
        return "PJ"
    return None


# ---------------------------------------------------------------------------
# Endereço
# ---------------------------------------------------------------------------

def normalizar_cep(valor):
    """Guarda só os 8 números do CEP ('13970-000' -> '13970000')."""
    if valor is None:
        return None
    digitos = re.sub(r"\D", "", str(valor))
    if len(digitos) != 8:
        raise ValueError("CEP inválido: informe os 8 números do CEP.")
    return digitos


def normalizar_uf(valor):
    if valor is None:
        return None
    uf = str(valor).strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", uf):
        raise ValueError("UF inválida: use a sigla com 2 letras (ex.: SP).")
    return uf


def normalizar_ddd(valor):
    if valor is None:
        return None
    ddd = re.sub(r"\D", "", str(valor))
    if ddd == "":
        return None
    if not re.fullmatch(r"\d{2,3}", ddd):
        raise ValueError("DDD inválido: use 2 ou 3 números.")
    return ddd