"""
Exportação de listagens em PDF e Excel (.xlsx) a partir de UMA definição de colunas por módulo.

Cada módulo (core/exportacao_modulos.py) monta um `Relatorio`: título, filtros aplicados na tela, a planilha principal
e, opcionalmente, planilhas extras (ex.: itens dos pedidos). Daqui saem:
- o PDF (A4 deitado, mesmo cabeçalho/rodapé dos outros documentos), só com a planilha principal e as colunas marcadas
  para PDF, com os totais das colunas somáveis;
- o Excel, com uma aba por planilha: título, filtros, cabeçalho em negrito, filtro automático, primeira linha congelada,
  números e datas como valores de verdade (dá para somar e ordenar) e linha de total com SUBTOTAL (respeita o filtro).
Gerar o arquivo nunca altera o banco.
"""
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer

from core import pdf as P

MAX_LINHAS = 10_000
TIPOS = ("texto", "data", "datahora", "dinheiro", "qtd", "inteiro", "pct")


@dataclass
class Coluna:
    titulo: str
    valor: Callable[[Any], Any]
    tipo: str = "texto"
    peso: float = 1.0          # largura relativa no PDF
    total: bool = False        # soma no fim (PDF e Excel)
    pdf: bool = True           # aparece no PDF? (o Excel leva todas)

    def __post_init__(self):
        assert self.tipo in TIPOS, self.tipo


@dataclass
class Planilha:
    nome: str
    colunas: List[Coluna]
    linhas: Sequence[Any]


@dataclass
class Relatorio:
    titulo: str
    arquivo: str                                   # nome base, sem extensão
    filtros: List[Tuple[str, str]]
    principal: Planilha
    extras: List[Planilha] = field(default_factory=list)


def checar_tamanho(qtd: int):
    if qtd == 0:
        raise HTTPException(status_code=400, detail="Não há registros para exportar com esses filtros.")
    if qtd > MAX_LINHAS:
        raise HTTPException(status_code=400, detail=f"São {qtd} registros: o limite da exportação é {MAX_LINHAS}. Refine os filtros.")


def _valor(coluna: Coluna, linha):
    try:
        return coluna.valor(linha)
    except (AttributeError, TypeError, KeyError):
        return None


def _numero(v):
    if v is None or v == "":
        return None
    return float(v) if isinstance(v, (Decimal, int, float)) else v


# ---------------------------------------------------------------- PDF

def _texto_pdf(tipo: str, v) -> str:
    if v is None or v == "":
        return "—"
    if tipo == "dinheiro":
        return P.brl(v)
    if tipo == "qtd":
        return P.qtd(v)
    if tipo == "data":
        return P.data_br(v)
    if tipo == "datahora":
        return P.data_hora_br(v)
    if tipo == "pct":
        return f"{float(v):.1f}%".replace(".", ",")
    return P._txt(v)


def gerar_pdf(rel: Relatorio, emitido_por: str) -> Tuple[bytes, str]:
    pl = rel.principal
    colunas = [c for c in pl.colunas if c.pdf]
    L = P.LARGURA_PAISAGEM
    linhas = [[_texto_pdf(c.tipo, _valor(c, item)) for c in colunas] for item in pl.linhas]
    direita = {i for i, c in enumerate(colunas) if c.tipo in ("dinheiro", "qtd", "inteiro", "pct")}
    tabela = P._tabela([c.titulo for c in colunas], linhas, [c.peso for c in colunas], direita, largura=L)

    pares = list(rel.filtros) + [("Registros", str(len(pl.linhas)))]
    historia = [
        P._bloco_titulo(rel.titulo.upper(), P.data_br(date.today()), largura=L, prefixo="Emitido em "),
        Spacer(1, 3 * mm), P._bloco_dados(pares, largura=L), Spacer(1, 3 * mm), tabela,
    ]
    totais = []
    for c in colunas:
        if c.total:
            soma = sum((Decimal(str(_valor(c, i) or 0)) for i in pl.linhas), Decimal("0"))
            totais.append(("Total" if c.titulo.lower() == "total" else f"Total — {c.titulo}", _texto_pdf(c.tipo, soma)))
    if totais:
        historia += [Spacer(1, 2 * mm), P._bloco_totais(totais, largura=L)]

    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer, pagesize=P.PAGINA_PAISAGEM, leftMargin=P.MARGEM, rightMargin=P.MARGEM, topMargin=33 * mm, bottomMargin=20 * mm,
        title=rel.titulo, author=P._empresa()["nome"],
    )
    documento.build(historia, canvasmaker=P._canvas_numerado(emitido_por, P._empresa(), None, P.PAGINA_PAISAGEM))
    return buffer.getvalue(), f"{rel.arquivo}-{date.today().isoformat()}.pdf"


# ---------------------------------------------------------------- Excel

_FORMATO = {"dinheiro": '"R$" #,##0.00', "qtd": "#,##0.###", "inteiro": "0", "pct": '0.0"%"',
            "data": "dd/mm/yyyy", "datahora": "dd/mm/yyyy hh:mm"}
_AZUL = "1F3A5F"
_FUNDO_CAB = PatternFill("solid", fgColor="E8EEF5")
_BORDA_CAB = Border(bottom=Side(style="medium", color=_AZUL))


def _valor_xlsx(tipo: str, v):
    if v is None or v == "":
        return None
    if tipo in ("dinheiro", "qtd", "pct"):
        return _numero(v)
    if tipo == "inteiro":
        return int(v)
    if tipo == "data":
        return v.date() if isinstance(v, datetime) else v
    if tipo == "datahora":
        return v
    return str(v)


def _nome_aba(nome: str, usados: set) -> str:
    limpo = "".join(ch for ch in nome if ch not in '[]:*?/\\')[:31] or "Planilha"
    base, n = limpo, 2
    while limpo in usados:
        limpo = f"{base[:28]} {n}"; n += 1
    usados.add(limpo)
    return limpo


def _escrever_aba(ws, rel: Relatorio, pl: Planilha, emitido_por: str):
    n = len(pl.colunas)
    ws["A1"] = rel.titulo if pl is rel.principal else f"{rel.titulo} — {pl.nome}"
    ws["A1"].font = Font(bold=True, size=14, color=_AZUL)
    filtros = " · ".join(f"{r}: {v}" for r, v in rel.filtros) or "Sem filtros"
    ws["A2"] = f"Filtros: {filtros}"
    ws["A3"] = f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} por {emitido_por} · {len(pl.linhas)} registro(s)"
    for c in ("A2", "A3"):
        ws[c].font = Font(size=9, color="5B6675")

    cab = 5
    for j, col in enumerate(pl.colunas, start=1):
        cel = ws.cell(row=cab, column=j, value=col.titulo)
        cel.font = Font(bold=True, color=_AZUL)
        cel.fill = _FUNDO_CAB
        cel.border = _BORDA_CAB
        cel.alignment = Alignment(vertical="center", wrap_text=True,
                                  horizontal="right" if col.tipo in ("dinheiro", "qtd", "inteiro", "pct") else "left")

    larguras = [len(c.titulo) + 2 for c in pl.colunas]
    for i, item in enumerate(pl.linhas, start=cab + 1):
        for j, col in enumerate(pl.colunas, start=1):
            v = _valor_xlsx(col.tipo, _valor(col, item))
            cel = ws.cell(row=i, column=j, value=v)
            if col.tipo in _FORMATO and v is not None:
                cel.number_format = _FORMATO[col.tipo]
            texto = (f"{v:,.2f}" if isinstance(v, float) else str(v)) if v is not None else ""
            larguras[j - 1] = max(larguras[j - 1], min(len(texto) + 2, 60))

    ultima = cab + len(pl.linhas)
    if pl.linhas:
        ws.auto_filter.ref = f"A{cab}:{get_column_letter(n)}{ultima}"
    ws.freeze_panes = ws.cell(row=cab + 1, column=1)

    if any(c.total for c in pl.colunas) and pl.linhas:
        linha_total = ultima + 1
        ws.cell(row=linha_total, column=1, value="Total (linhas visíveis)").font = Font(bold=True)
        for j, col in enumerate(pl.colunas, start=1):
            if col.total:
                letra = get_column_letter(j)
                cel = ws.cell(row=linha_total, column=j, value=f"=SUBTOTAL(9,{letra}{cab + 1}:{letra}{ultima})")
                cel.font = Font(bold=True)
                cel.number_format = _FORMATO.get(col.tipo, "General")
                cel.border = Border(top=Side(style="thin", color=_AZUL))

    for j, largura in enumerate(larguras, start=1):
        tipo = pl.colunas[j - 1].tipo
        minimo = {"data": 12, "datahora": 17, "dinheiro": 14}.get(tipo, 8)
        ws.column_dimensions[get_column_letter(j)].width = max(minimo, min(largura, 60))
    ws.row_dimensions[cab].height = 30


def gerar_xlsx(rel: Relatorio, emitido_por: str) -> Tuple[bytes, str]:
    wb = Workbook()
    usados: set = set()
    planilhas = [rel.principal] + list(rel.extras)
    for k, pl in enumerate(planilhas):
        ws = wb.active if k == 0 else wb.create_sheet()
        ws.title = _nome_aba(pl.nome, usados)
        _escrever_aba(ws, rel, pl, emitido_por)
    wb.properties.title = rel.titulo
    wb.properties.creator = P._empresa()["nome"]
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue(), f"{rel.arquivo}-{date.today().isoformat()}.xlsx"
