"""
Documentos em PDF (ReportLab): cotação, pedido de venda e pedido de compra.

- Os dados da empresa vêm de variáveis de ambiente (EMPRESA_NOME, EMPRESA_CNPJ, EMPRESA_ENDERECO,
  EMPRESA_TELEFONE, EMPRESA_EMAIL), lidas a cada geração. Só o nome é obrigatório (padrão: Nova Sorvetes).
- Gerar o PDF nunca altera nada no banco.
- Parcelas: quando o pedido já tem títulos financeiros, mostra os títulos reais (vencimento, valor e situação);
  senão, mostra as parcelas PREVISTAS da forma de pagamento (prazo em dias e valor), porque o vencimento só
  nasce na confirmação (venda) ou na aprovação (cotação).
- Fonte Helvetica (padrão do PDF): cobre o português; caracteres fora do Latin-1 podem não aparecer.
"""
import io
import os
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from xml.sax.saxutils import escape

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session, joinedload

from core.pagamento import gerar_parcelas
from models import (
    Cotacao, ItemCotacao, ItemPedidoCompra, ItemPedidoVenda, PedidoCompra, PedidoVenda, TituloFinanceiro,
)

MARGEM = 18 * mm
LARGURA_UTIL = A4[0] - 2 * MARGEM
COR_TITULO = colors.HexColor("#1f3a5f")
COR_CABECALHO_TABELA = colors.HexColor("#e8eef5")
COR_LINHA = colors.HexColor("#c9d3df")
COR_TEXTO_SUAVE = colors.HexColor("#5b6675")

STATUS_COTACAO = {"rascunho": "RASCUNHO", "enviada": "ENVIADA", "recebida": "RECEBIDA", "aprovada": "APROVADA", "recusada": "RECUSADA"}
STATUS_VENDA = {"aberto": "ABERTO", "confirmado": "CONFIRMADO", "cancelado": "CANCELADO"}
STATUS_COMPRA = {"pendente": "PENDENTE", "recebido": "RECEBIDO", "cancelado": "CANCELADO"}
SITUACAO_TITULO = {"aberto": "Em aberto", "parcial": "Parcial", "pago": "Pago", "cancelado": "Cancelado"}
FAIXA = {"cancelado": "CANCELADO", "recusada": "RECUSADA"}   # status que ganham a faixa diagonal


# ---------------------------------------------------------------- formatação

def brl(valor) -> str:
    v = Decimal(str(valor or 0)).quantize(Decimal("0.01"))
    texto = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {texto}"


def qtd(valor) -> str:
    texto = f"{Decimal(str(valor or 0)):.3f}".rstrip("0").rstrip(".")
    return (texto or "0").replace(".", ",")


def data_br(d) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


def data_hora_br(d) -> str:
    return d.strftime("%d/%m/%Y %H:%M") if d else "—"


def _txt(valor) -> str:
    return escape(str(valor)) if valor not in (None, "") else "—"


# ---------------------------------------------------------------- estilos

_base = getSampleStyleSheet()
ST_NORMAL = ParagraphStyle("n", parent=_base["Normal"], fontName="Helvetica", fontSize=9, leading=11.5)
ST_SUAVE = ParagraphStyle("s", parent=ST_NORMAL, textColor=COR_TEXTO_SUAVE, fontSize=8)
ST_DIREITA = ParagraphStyle("d", parent=ST_NORMAL, alignment=TA_RIGHT)
ST_NEGRITO = ParagraphStyle("b", parent=ST_NORMAL, fontName="Helvetica-Bold")
ST_TITULO = ParagraphStyle("t", parent=ST_NORMAL, fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=COR_TITULO)
ST_SECAO = ParagraphStyle("sec", parent=ST_NORMAL, fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=COR_TITULO, spaceBefore=8, spaceAfter=3)
ST_STATUS = ParagraphStyle("st", parent=ST_NORMAL, fontName="Helvetica-Bold", fontSize=10, alignment=TA_RIGHT, textColor=COR_TITULO)
ST_CELULA = ParagraphStyle("c", parent=ST_NORMAL, fontSize=8.5, leading=10.5)
ST_CELULA_D = ParagraphStyle("cd", parent=ST_CELULA, alignment=TA_RIGHT)
ST_CABECALHO = ParagraphStyle("h", parent=ST_CELULA, fontName="Helvetica-Bold")
ST_CABECALHO_D = ParagraphStyle("hd", parent=ST_CABECALHO, alignment=TA_RIGHT)


def _p(texto, estilo=ST_NORMAL):
    return Paragraph(texto, estilo)


# ---------------------------------------------------------------- página (cabeçalho, rodapé, faixa)

def _empresa() -> dict:
    return {
        "nome": os.getenv("EMPRESA_NOME") or "Nova Sorvetes",
        "cnpj": os.getenv("EMPRESA_CNPJ"), "endereco": os.getenv("EMPRESA_ENDERECO"),
        "telefone": os.getenv("EMPRESA_TELEFONE"), "email": os.getenv("EMPRESA_EMAIL"),
    }


def _canvas_numerado(emitido_por: str, empresa: dict, faixa: Optional[str]):
    class CanvasNumerado(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._paginas = []

        def showPage(self):
            self._paginas.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._paginas)
            for estado in self._paginas:
                self.__dict__.update(estado)
                self._moldura(total)
                super().showPage()
            super().save()

        def _moldura(self, total):
            largura, altura = A4
            # cabeçalho
            self.setFillColor(COR_TITULO)
            self.setFont("Helvetica-Bold", 13)
            self.drawString(MARGEM, altura - 14 * mm, empresa["nome"])
            detalhes = " · ".join(x for x in (empresa["cnpj"] and f"CNPJ {empresa['cnpj']}", empresa["telefone"], empresa["email"]) if x)
            self.setFont("Helvetica", 8)
            self.setFillColor(COR_TEXTO_SUAVE)
            y = altura - 18.5 * mm
            for linha in (empresa["endereco"], detalhes):
                if linha:
                    self.drawString(MARGEM, y, linha[:110]); y -= 3.8 * mm
            self.setStrokeColor(COR_TITULO); self.setLineWidth(0.8)
            self.line(MARGEM, altura - 28 * mm, largura - MARGEM, altura - 28 * mm)
            # rodapé
            self.setStrokeColor(COR_LINHA); self.setLineWidth(0.5)
            self.line(MARGEM, 14 * mm, largura - MARGEM, 14 * mm)
            self.setFont("Helvetica", 7.5); self.setFillColor(COR_TEXTO_SUAVE)
            self.drawString(MARGEM, 10 * mm, f"Documento gerado em {data_hora_br(datetime.now())} por {emitido_por}")
            self.drawRightString(largura - MARGEM, 10 * mm, f"Página {self._pageNumber} de {total}")
            # faixa diagonal (pedido cancelado, cotação recusada)
            if faixa:
                self.saveState()
                self.setFillColor(colors.HexColor("#c0392b")); self.setFillAlpha(0.13)
                self.setFont("Helvetica-Bold", 90)
                self.translate(largura / 2, altura / 2); self.rotate(35)
                self.drawCentredString(0, 0, faixa)
                self.restoreState()
    return CanvasNumerado


# ---------------------------------------------------------------- blocos

def _bloco_titulo(titulo: str, status: str) -> Table:
    t = Table([[_p(titulo, ST_TITULO), _p(f"Status: {status}", ST_STATUS)]], colWidths=[LARGURA_UTIL * 0.68, LARGURA_UTIL * 0.32])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _bloco_dados(pares: List[Tuple[str, str]]) -> Table:
    """Pares rótulo/valor em duas colunas de pares."""
    linhas = []
    for i in range(0, len(pares), 2):
        linha = []
        for rotulo, valor in pares[i:i + 2]:
            linha += [_p(rotulo, ST_SUAVE), _p(valor)]
        while len(linha) < 4:
            linha += [_p(""), _p("")]
        linhas.append(linha)
    t = Table(linhas, colWidths=[LARGURA_UTIL * 0.14, LARGURA_UTIL * 0.36, LARGURA_UTIL * 0.14, LARGURA_UTIL * 0.36])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.5, COR_LINHA), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
    ]))
    return t


def _tabela(cabecalho: List[str], linhas: List[List[str]], larguras: List[float], colunas_direita: set) -> Table:
    dados = [[_p(c, ST_CABECALHO_D if i in colunas_direita else ST_CABECALHO) for i, c in enumerate(cabecalho)]]
    for linha in linhas:
        dados.append([_p(c, ST_CELULA_D if i in colunas_direita else ST_CELULA) for i, c in enumerate(linha)])
    soma = sum(larguras)
    t = Table(dados, colWidths=[LARGURA_UTIL * l / soma for l in larguras], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COR_CABECALHO_TABELA), ("LINEBELOW", (0, 0), (-1, 0), 0.8, COR_TITULO),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, COR_LINHA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _bloco_totais(linhas: List[Tuple[str, str]]) -> Table:
    destaque = ParagraphStyle("destaque", parent=ST_DIREITA, fontName="Helvetica-Bold", fontSize=10, leading=13)
    dados = []
    for n, (rotulo, valor) in enumerate(linhas):
        estilo = destaque if n == len(linhas) - 1 else ST_DIREITA
        dados.append([_p(rotulo, estilo), _p(valor, estilo)])
    t = Table(dados, colWidths=[LARGURA_UTIL * 0.55, LARGURA_UTIL * 0.27], hAlign="RIGHT")
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, COR_TITULO),
    ]))
    return t


def _parcelas_previstas(forma, total: Optional[Decimal]) -> Optional[Table]:
    if not forma or not forma.parcelas or total is None or total <= 0:
        return None
    previstas = gerar_parcelas(forma.parcelas, total, date.today())
    linhas = []
    for p, molde in zip(previstas, sorted(forma.parcelas, key=lambda x: x.numero)):
        prazo = "À vista" if molde.prazo_dias == 0 else f"{molde.prazo_dias} dias"
        linhas.append([f"{p['numero']}/{len(previstas)}", prazo, f"{p['percentual']:.2f}%".replace(".", ","), brl(p["valor"])])
    return _tabela(["Parcela", "Prazo", "Percentual", "Valor"], linhas, [1, 2, 2, 2], {2, 3})


def _parcelas_reais(titulos: List[TituloFinanceiro]) -> Table:
    linhas = []
    for t in titulos:
        situacao = SITUACAO_TITULO.get(t.status, t.status)
        if t.status == "parcial":
            situacao += f" (pago {brl(t.valor_pago)})"
        linhas.append([f"{t.numero_parcela}/{t.total_parcelas}", data_br(t.vencimento), brl(t.valor), situacao])
    return _tabela(["Parcela", "Vencimento", "Valor", "Situação"], linhas, [1, 2, 2, 3], {2})


def _secao(titulo: str, conteudo) -> KeepTogether:
    return KeepTogether([_p(titulo, ST_SECAO), conteudo])


def _montar(titulo, status, pares, tabela_itens, totais, parcelas, rotulo_parcelas, observacao, faixa, emitido_por) -> bytes:
    historia = [_bloco_titulo(titulo, status), Spacer(1, 3 * mm), _bloco_dados(pares), Spacer(1, 2 * mm),
                _p("Itens", ST_SECAO), tabela_itens, Spacer(1, 2 * mm), _bloco_totais(totais)]
    if parcelas is not None:
        historia.append(_secao(rotulo_parcelas, parcelas))
    if observacao:
        historia.append(_secao("Observações", _p(escape(observacao))))
    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=MARGEM, rightMargin=MARGEM, topMargin=33 * mm, bottomMargin=20 * mm,
        title=titulo, author=_empresa()["nome"],
    )
    documento.build(historia, canvasmaker=_canvas_numerado(emitido_por, _empresa(), faixa))
    return buffer.getvalue()


# ---------------------------------------------------------------- partes

def _endereco_cliente(cliente) -> str:
    ativos = [e for e in cliente.enderecos if e.ativo]
    if not ativos:
        return "—"
    e = ativos[0]
    partes = [", ".join(x for x in (e.logradouro, e.numero) if x), e.complemento, e.bairro,
              "/".join(x for x in (e.cidade, e.uf) if x), f"CEP {e.cep}" if e.cep else None]
    return _txt(" - ".join(x for x in partes if x))


def _endereco_fornecedor(f) -> str:
    partes = [", ".join(x for x in (f.logradouro, f.numero) if x), f.complemento, f.bairro,
              "/".join(x for x in (f.cidade, f.uf) if x), f"CEP {f.cep}" if f.cep else None]
    texto = " - ".join(x for x in partes if x)
    return _txt(texto) if texto else "—"


def _pares_parte(rotulo: str, nome, documento, telefone, email, endereco: str) -> List[Tuple[str, str]]:
    return [(rotulo, _txt(nome)), ("CPF/CNPJ", _txt(documento)), ("Telefone", _txt(telefone)), ("E-mail", _txt(email)), ("Endereço", endereco)]


def _unidade(produto) -> str:
    return _txt(produto.unidade_medida.sigla if produto.unidade_medida else None)


# ---------------------------------------------------------------- cotação

def pdf_cotacao(db: Session, cotacao_id: int, emitido_por: str) -> Tuple[bytes, str]:
    cot = (
        db.query(Cotacao).options(joinedload(Cotacao.itens).joinedload(ItemCotacao.produto))
        .filter(Cotacao.id == cotacao_id).first()
    )
    if not cot:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    from models import FormaPagamento
    forma = db.get(FormaPagamento, cot.forma_pagamento_id) if cot.forma_pagamento_id else None
    venda = cot.tipo == "venda"

    if venda:
        c = cot.cliente
        pares = _pares_parte("Cliente", c.nome, c.cpf_cnpj, c.telefone, c.email, _endereco_cliente(c))
    else:
        f = cot.fornecedor
        pares = _pares_parte("Fornecedor", f.nome, f.cnpj, f.telefone, f.email, _endereco_fornecedor(f))
    pares += [("Data", data_br(cot.data_cotacao)), ("Validade", data_br(cot.validade)),
              ("Forma de pgto.", _txt(forma.descricao if forma else None))]
    if cot.pedido_venda_id:
        pares.append(("Pedido gerado", f"Pedido de venda nº {cot.pedido_venda_id}"))
    if cot.pedido_compra_id:
        pares.append(("Pedido gerado", f"Pedido de compra nº {cot.pedido_compra_id}"))

    linhas, total, descontos, falta_preco = [], Decimal("0"), Decimal("0"), False
    for i in cot.itens:
        q = Decimal(str(i.quantidade))
        if i.preco_unitario is None:
            falta_preco = True
            linha = [_txt(i.produto.nome), _unidade(i.produto), qtd(q), "A definir"]
            subtotal_txt = "—"
        else:
            desconto = Decimal(str(i.desconto or 0))
            subtotal = (q * Decimal(str(i.preco_unitario)) - desconto).quantize(Decimal("0.01"))
            total += subtotal; descontos += desconto
            linha = [_txt(i.produto.nome), _unidade(i.produto), qtd(q), brl(i.preco_unitario)]
            subtotal_txt = brl(subtotal)
        if venda:
            linha.append(brl(i.desconto) if i.desconto else "—")
        linha.append(subtotal_txt)
        if i.observacao:
            linha[0] += f"<br/><font size=7 color='#5b6675'>{escape(i.observacao)}</font>"
        linhas.append(linha)
    if venda:
        tabela = _tabela(["Produto", "Un.", "Qtd.", "Preço unit.", "Desconto", "Subtotal"], linhas, [5, 1, 1.3, 2, 2, 2.2], {2, 3, 4, 5})
    else:
        tabela = _tabela(["Produto", "Un.", "Qtd.", "Preço unit.", "Subtotal"], linhas, [5, 1, 1.3, 2, 2.2], {2, 3, 4})

    totais = []
    if descontos:
        totais.append(("Descontos", brl(descontos)))
    totais.append(("Total", "A definir" if falta_preco else brl(total)))
    parcelas = None if falta_preco else _parcelas_previstas(forma, total)
    status = STATUS_COTACAO.get(cot.status, cot.status.upper())
    pdf = _montar(
        f"COTAÇÃO DE {'VENDA' if venda else 'COMPRA'} Nº {cot.id}", status, pares, tabela, totais,
        parcelas, "Condição de pagamento (parcelas previstas)", cot.observacao, FAIXA.get(cot.status), emitido_por,
    )
    return pdf, f"cotacao-{'venda' if venda else 'compra'}-{cot.id}.pdf"


# ---------------------------------------------------------------- pedido de venda

def pdf_pedido_venda(db: Session, pedido_id: int, emitido_por: str) -> Tuple[bytes, str]:
    ped = (
        db.query(PedidoVenda).options(joinedload(PedidoVenda.itens).joinedload(ItemPedidoVenda.produto))
        .filter(PedidoVenda.id == pedido_id).first()
    )
    if not ped:
        raise HTTPException(status_code=404, detail="Pedido de venda não encontrado")
    c, forma = ped.cliente, ped.forma_pagamento
    pares = _pares_parte("Cliente", c.nome, c.cpf_cnpj, c.telefone, c.email, _endereco_cliente(c))
    pares += [("Data do pedido", data_br(ped.data_pedido)), ("Confirmado em", data_br(ped.confirmado_em)),
              ("Forma de pgto.", _txt(forma.descricao if forma else None))]

    linhas, descontos = [], Decimal("0")
    for i in sorted(ped.itens, key=lambda x: x.id):
        descontos += Decimal(str(i.desconto or 0))
        linhas.append([_txt(i.produto.nome), _unidade(i.produto), qtd(i.quantidade), brl(i.preco_unitario),
                       brl(i.desconto) if i.desconto else "—", brl(i.subtotal)])
    tabela = _tabela(["Produto", "Un.", "Qtd.", "Preço unit.", "Desconto", "Subtotal"], linhas, [5, 1, 1.3, 2, 2, 2.2], {2, 3, 4, 5})
    totais = ([("Descontos", brl(descontos))] if descontos else []) + [("Total", brl(ped.valor_total))]

    titulos = db.query(TituloFinanceiro).filter(TituloFinanceiro.pedido_venda_id == ped.id).order_by(TituloFinanceiro.numero_parcela).all()
    if titulos:
        parcelas, rotulo = _parcelas_reais(titulos), "Parcelas (contas a receber)"
    else:
        parcelas, rotulo = _parcelas_previstas(forma, Decimal(str(ped.valor_total or 0))), "Condição de pagamento (parcelas previstas, vencem na confirmação)"
    pdf = _montar(f"PEDIDO DE VENDA Nº {ped.id}", STATUS_VENDA.get(ped.status, ped.status.upper()), pares, tabela, totais,
                  parcelas, rotulo, ped.observacao, FAIXA.get(ped.status), emitido_por)
    return pdf, f"pedido-venda-{ped.id}.pdf"


# ---------------------------------------------------------------- pedido de compra

def pdf_pedido_compra(db: Session, pedido_id: int, emitido_por: str) -> Tuple[bytes, str]:
    ped = (
        db.query(PedidoCompra).options(joinedload(PedidoCompra.itens).joinedload(ItemPedidoCompra.produto))
        .filter(PedidoCompra.id == pedido_id).first()
    )
    if not ped:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado")
    f, forma = ped.fornecedor, ped.forma_pagamento
    pares = _pares_parte("Fornecedor", f.nome, f.cnpj, f.telefone, f.email, _endereco_fornecedor(f))
    pares += [("Data do pedido", data_br(ped.data_pedido)), ("Entrega prevista", data_br(ped.data_entrega_prevista)),
              ("Forma de pgto.", _txt(forma.descricao if forma else None))]

    linhas = []
    for i in sorted(ped.itens, key=lambda x: x.id):
        linhas.append([_txt(i.produto.nome), _unidade(i.produto), qtd(i.quantidade), qtd(i.quantidade_recebida),
                       brl(i.preco_unitario), brl(i.subtotal)])
    tabela = _tabela(["Produto", "Un.", "Qtd. pedida", "Qtd. recebida", "Preço unit.", "Subtotal"], linhas, [5, 1, 1.6, 1.8, 2, 2.2], {2, 3, 4, 5})
    titulos = db.query(TituloFinanceiro).filter(TituloFinanceiro.pedido_compra_id == ped.id).order_by(TituloFinanceiro.numero_parcela).all()
    if titulos:
        parcelas, rotulo = _parcelas_reais(titulos), "Parcelas (contas a pagar)"
    else:
        parcelas, rotulo = _parcelas_previstas(forma, Decimal(str(ped.valor_total or 0))), "Condição de pagamento (parcelas previstas)"
    pdf = _montar(f"PEDIDO DE COMPRA Nº {ped.id}", STATUS_COMPRA.get(ped.status, ped.status.upper()), pares, tabela,
                  [("Total", brl(ped.valor_total))], parcelas, rotulo, ped.observacao, FAIXA.get(ped.status), emitido_por)
    return pdf, f"pedido-compra-{ped.id}.pdf"
