"""
Regras do financeiro (contas a pagar e a receber) em um único lugar.

- gerar_titulos: aplica as parcelas da forma de pagamento ao valor do pedido.
- cancelar_titulos_do_pedido: cancela os títulos junto com o pedido (bloqueia se já houve baixa).
- registrar_baixa / estornar_baixa: pagamento e recebimento, total ou parcial.

Como em core/pedidos.py, as funções NÃO fazem commit: quem chama decide quando confirmar a transação.
Títulos e baixas sempre são alterados com a linha do título TRAVADA (SELECT ... FOR UPDATE), então
duas baixas simultâneas nunca passam do saldo e uma baixa nunca atravessa o cancelamento do pedido.
"""
import calendar
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from core.pagamento import gerar_parcelas
from models import TituloFinanceiro, BaixaTitulo, CategoriaFinanceira, Cliente, Fornecedor

_CENTAVO = Decimal("0.01")
_A_VISTA = SimpleNamespace(numero=1, prazo_dias=0, percentual=Decimal("100"))

STATUS_EM_ABERTO = ("aberto", "parcial")


def _decimal(valor) -> Decimal:
    return Decimal(str(valor)).quantize(_CENTAVO)


def categoria_padrao(db: Session, tipo: str) -> CategoriaFinanceira:
    """Categoria 'sistema' dos títulos que nascem de pedidos (Vendas para receber, Compra de insumos para pagar)."""
    categoria = db.query(CategoriaFinanceira).filter(
        CategoriaFinanceira.sistema.is_(True), CategoriaFinanceira.tipo == tipo
    ).first()
    if not categoria:   # a migração cria; isto só protege um banco sem as categorias iniciais
        categoria = CategoriaFinanceira(nome="Vendas" if tipo == "receber" else "Compra de insumos",
                                        tipo=tipo, sistema=True, ativo=True)
        db.add(categoria)
        db.flush()
    return categoria


def gerar_titulos(db: Session, *, tipo: str, pedido, forma, data_base: date) -> List[TituloFinanceiro]:
    """
    Cria os títulos de um pedido. `tipo` é 'receber' (pedido de venda) ou 'pagar' (pedido de compra).
    Sem forma de pagamento (pedido antigo) vira um título único à vista, vencendo em `data_base`.
    Pedido de valor zero não gera título. Se o pedido já tem títulos, não gera de novo.
    """
    coluna = TituloFinanceiro.pedido_venda_id if tipo == "receber" else TituloFinanceiro.pedido_compra_id
    if db.query(TituloFinanceiro.id).filter(coluna == pedido.id).first():
        return []

    total = _decimal(pedido.valor_total or 0)
    if total <= 0:
        return []

    moldes = list(forma.parcelas) if forma is not None and forma.parcelas else [_A_VISTA]
    parcelas = gerar_parcelas(moldes, total, data_base)
    taxa = _decimal(forma.taxa_percentual or 0) if (tipo == "receber" and forma is not None) else Decimal("0.00")

    categoria = categoria_padrao(db, tipo)
    titulos = []
    for parcela in parcelas:
        titulo = TituloFinanceiro(
            tipo=tipo,
            categoria_id=categoria.id,
            numero_parcela=parcela["numero"],
            total_parcelas=len(parcelas),
            vencimento=parcela["vencimento"],
            valor=parcela["valor"],
            taxa_percentual=taxa,
            valor_pago=Decimal("0.00"),
            status="aberto",
        )
        if tipo == "receber":
            titulo.pedido_venda_id = pedido.id
            titulo.cliente_id = pedido.cliente_id
        else:
            titulo.pedido_compra_id = pedido.id
            titulo.fornecedor_id = pedido.fornecedor_id
        db.add(titulo)
        titulos.append(titulo)
    db.flush()
    return titulos


def cancelar_titulos_do_pedido(db: Session, *, tipo: str, pedido_id: int) -> None:
    """
    Cancela os títulos do pedido. Se algum já tem pagamento/recebimento lançado, o cancelamento do
    pedido é barrado: primeiro é preciso estornar as baixas (o dinheiro já se movimentou).
    """
    coluna = TituloFinanceiro.pedido_venda_id if tipo == "receber" else TituloFinanceiro.pedido_compra_id
    titulos = (
        db.query(TituloFinanceiro)
        .filter(coluna == pedido_id)
        .order_by(TituloFinanceiro.id)
        .with_for_update()
        .populate_existing()
        .all()
    )
    com_baixa = [t for t in titulos if t.status != "cancelado" and t.valor_pago > 0]
    if com_baixa:
        movimentado = sum((t.valor_pago for t in com_baixa), Decimal("0.00"))
        verbo = "recebimento" if tipo == "receber" else "pagamento"
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível cancelar: {len(com_baixa)} título(s) deste pedido já têm {verbo} registrado "
                   f"(total R$ {movimentado:.2f}). Estorne as baixas em /financeiro/titulos antes de cancelar o pedido.",
        )
    for titulo in titulos:
        titulo.status = "cancelado"
    db.flush()


def _travar_titulo(db: Session, titulo_id: int) -> TituloFinanceiro:
    titulo = (
        db.query(TituloFinanceiro)
        .filter(TituloFinanceiro.id == titulo_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not titulo:
        raise HTTPException(status_code=404, detail="Título não encontrado")
    return titulo


def recalcular_titulo(db: Session, titulo: TituloFinanceiro) -> None:
    """Refaz valor_pago e status a partir das baixas não estornadas (nunca por soma incremental)."""
    db.flush()
    baixas = db.query(BaixaTitulo).filter(BaixaTitulo.titulo_id == titulo.id, BaixaTitulo.estornada.is_(False)).all()
    pago = sum((b.valor for b in baixas), Decimal("0.00"))
    titulo.valor_pago = pago
    if titulo.status != "cancelado":
        if pago >= titulo.valor:
            titulo.status = "pago"
        elif pago > 0:
            titulo.status = "parcial"
        else:
            titulo.status = "aberto"


def registrar_baixa(db: Session, titulo_id: int, usuario_id: int, valor: Decimal,
                    data_pagamento: date, observacao=None) -> TituloFinanceiro:
    titulo = _travar_titulo(db, titulo_id)
    if titulo.status not in STATUS_EM_ABERTO:
        raise HTTPException(status_code=400, detail=f"Só é possível dar baixa em título 'aberto' ou 'parcial'. Status atual: '{titulo.status}'")

    saldo = titulo.valor - titulo.valor_pago
    if valor > saldo:
        raise HTTPException(status_code=400, detail=f"O valor da baixa (R$ {valor:.2f}) é maior que o saldo do título (R$ {saldo:.2f})")

    db.add(BaixaTitulo(titulo_id=titulo.id, valor=valor, data_pagamento=data_pagamento,
                       usuario_id=usuario_id, observacao=observacao))
    recalcular_titulo(db, titulo)
    return titulo


def estornar_baixa(db: Session, titulo_id: int, baixa_id: int, usuario_id: int) -> TituloFinanceiro:
    titulo = _travar_titulo(db, titulo_id)
    baixa = db.query(BaixaTitulo).filter(BaixaTitulo.id == baixa_id, BaixaTitulo.titulo_id == titulo.id).first()
    if not baixa:
        raise HTTPException(status_code=404, detail="Baixa não encontrada neste título")
    if baixa.estornada:
        raise HTTPException(status_code=400, detail="Esta baixa já foi estornada")
    if titulo.status == "cancelado":
        raise HTTPException(status_code=400, detail="O título está cancelado")

    baixa.estornada = True
    baixa.estornada_em = datetime.now()
    baixa.estornada_por_id = usuario_id
    recalcular_titulo(db, titulo)
    return titulo


# ---------------------------------------------------------------- lançamentos avulsos

def somar_meses(base: date, meses: int) -> date:
    """Soma meses mantendo o dia; se o mês de destino for mais curto, vai para o último dia dele (31/01 + 1 = 28/02)."""
    indice = base.year * 12 + (base.month - 1) + meses
    ano, mes = divmod(indice, 12)
    mes += 1
    return date(ano, mes, min(base.day, calendar.monthrange(ano, mes)[1]))


def _validar_categoria(db: Session, categoria_id: int, tipo: str) -> CategoriaFinanceira:
    categoria = db.query(CategoriaFinanceira).filter(CategoriaFinanceira.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria financeira não encontrada")
    if not categoria.ativo:
        raise HTTPException(status_code=400, detail=f"A categoria '{categoria.nome}' está inativa")
    if categoria.tipo != tipo:
        raise HTTPException(
            status_code=400,
            detail=f"A categoria '{categoria.nome}' é de '{categoria.tipo}' e o lançamento é '{tipo}'",
        )
    return categoria


def _validar_parte(db: Session, tipo: str, cliente_id, fornecedor_id) -> None:
    if tipo == "pagar" and cliente_id is not None:
        raise HTTPException(status_code=400, detail="Título a pagar não tem cliente: informe um fornecedor (ou nenhum)")
    if tipo == "receber" and fornecedor_id is not None:
        raise HTTPException(status_code=400, detail="Título a receber não tem fornecedor: informe um cliente (ou nenhum)")
    if cliente_id is not None:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        if not cliente.ativo:
            raise HTTPException(status_code=400, detail="O cliente selecionado está inativo")
    if fornecedor_id is not None:
        fornecedor = db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()
        if not fornecedor:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
        if not fornecedor.ativo:
            raise HTTPException(status_code=400, detail="O fornecedor selecionado está inativo")


def criar_titulos_avulsos(db: Session, *, tipo: str, descricao: str, categoria_id: int, valor: Decimal,
                          vencimento: date, cliente_id=None, fornecedor_id=None,
                          repetir_meses=None) -> List[TituloFinanceiro]:
    """Lançamento sem pedido (aluguel, energia...). Com `repetir_meses`, cria um título por mês."""
    _validar_categoria(db, categoria_id, tipo)
    _validar_parte(db, tipo, cliente_id, fornecedor_id)

    quantidade = repetir_meses or 1
    titulos = []
    for indice in range(quantidade):
        titulo = TituloFinanceiro(
            tipo=tipo,
            categoria_id=categoria_id,
            descricao=descricao,
            cliente_id=cliente_id,
            fornecedor_id=fornecedor_id,
            numero_parcela=indice + 1,
            total_parcelas=quantidade,
            vencimento=somar_meses(vencimento, indice),
            valor=valor,
            taxa_percentual=Decimal("0.00"),
            valor_pago=Decimal("0.00"),
            status="aberto",
        )
        db.add(titulo)
        titulos.append(titulo)
    db.flush()
    return titulos


def _travar_avulso(db: Session, titulo_id: int, acao: str) -> TituloFinanceiro:
    titulo = _travar_titulo(db, titulo_id)
    if not titulo.avulso:
        raise HTTPException(
            status_code=400,
            detail=f"Título de pedido não pode ser {acao} isoladamente: ele acompanha o pedido de origem",
        )
    if titulo.status == "cancelado":
        raise HTTPException(status_code=400, detail="O título está cancelado")
    if titulo.valor_pago > 0 or titulo.status != "aberto":
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível {acao} título 'aberto' e sem baixa. Estorne as baixas primeiro (status atual: '{titulo.status}')",
        )
    return titulo


def editar_titulo_avulso(db: Session, titulo_id: int, campos: dict) -> TituloFinanceiro:
    """Altera só os campos presentes em `campos`. Cliente/fornecedor aceitam None (remove a parte)."""
    titulo = _travar_avulso(db, titulo_id, "editar")

    if "categoria_id" in campos:
        _validar_categoria(db, campos["categoria_id"], titulo.tipo)
    novo_cliente = campos.get("cliente_id", titulo.cliente_id)
    novo_fornecedor = campos.get("fornecedor_id", titulo.fornecedor_id)
    if "cliente_id" in campos or "fornecedor_id" in campos:
        _validar_parte(db, titulo.tipo,
                       campos["cliente_id"] if "cliente_id" in campos else None,
                       campos["fornecedor_id"] if "fornecedor_id" in campos else None)

    for nome in ("descricao", "categoria_id", "valor", "vencimento"):
        if nome in campos:
            setattr(titulo, nome, campos[nome])
    titulo.cliente_id = novo_cliente
    titulo.fornecedor_id = novo_fornecedor
    db.flush()
    return titulo


def cancelar_titulo_avulso(db: Session, titulo_id: int) -> TituloFinanceiro:
    titulo = _travar_avulso(db, titulo_id, "cancelar")
    titulo.status = "cancelado"
    db.flush()
    return titulo
