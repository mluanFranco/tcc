from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session
from database import get_db
from models import Cotacao, ItemCotacao, Fornecedor, Cliente, FormaPagamento, Produto, Usuario
from schemas.cotacao import (
    CotacaoCreate, CotacaoUpdate, CotacaoUpdateStatus, CotacaoResponse,
    AprovacaoResponse, ComparativoFornecedor,
)
from schemas.pedido_venda import PedidoVendaCreate, ItemPedidoVendaCreate
from schemas.pedido_compra import PedidoCompraCreate, ItemPedidoCompraCreate
from core.security import get_current_user
from core.pedidos import registrar_pedido_venda, registrar_pedido_compra
from typing import List, Optional
from datetime import date, datetime

router = APIRouter(prefix="/cotacoes", tags=["Cotações"])

STATUS_VALIDOS = ("rascunho", "enviada", "recebida", "aprovada", "recusada")
STATUS_EDITAVEIS = ("rascunho", "enviada", "recebida")

# Transições por tipo. "aprovada" não aparece aqui: só POST /{id}/aprovar leva a ela.
TRANSICOES = {
    "compra": {
        "rascunho": {"enviada", "recebida", "recusada"},
        "enviada":  {"recebida", "recusada"},
        "recebida": {"recusada"},
    },
    "venda": {
        "rascunho": {"enviada", "recusada"},
        "enviada":  {"recusada"},
    },
}


# ---------- auxiliares ----------

def _travar_cotacao(db: Session, cotacao_id: int) -> Cotacao:
    """Trava a cotação até o fim da transação: duas requisições mexendo na mesma cotação passam uma de cada vez."""
    cotacao = (
        db.query(Cotacao)
        .filter(Cotacao.id == cotacao_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not cotacao:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    return cotacao


def _validar_parte(db: Session, tipo: str, fornecedor_id, cliente_id) -> None:
    if tipo == "compra":
        fornecedor = db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()
        if not fornecedor:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
        if not fornecedor.ativo:
            raise HTTPException(status_code=400, detail="O fornecedor selecionado está inativo")
    else:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        if not cliente.ativo:
            raise HTTPException(status_code=400, detail="O cliente selecionado está inativo")


def _validar_forma(db: Session, forma_pagamento_id) -> None:
    if forma_pagamento_id is None:
        return
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_pagamento_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
    if not forma.ativo:
        raise HTTPException(status_code=400, detail="A forma de pagamento selecionada está inativa")


def _validar_itens(db: Session, tipo: str, itens) -> None:
    """Produtos existem e estão ativos; regras de preço/desconto que dependem do tipo."""
    produtos = {p.id: p for p in db.query(Produto).filter(Produto.id.in_([i.produto_id for i in itens])).all()}
    for item in itens:
        produto = produtos.get(item.produto_id)
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")
        if not produto.ativo:
            raise HTTPException(status_code=400, detail=f"O produto '{produto.nome}' está inativo")
        if tipo == "venda" and item.preco_unitario is None:
            raise HTTPException(status_code=400, detail=f"Em cotação de venda o item '{produto.nome}' precisa de preço")
        if tipo == "compra" and item.desconto != 0:
            raise HTTPException(status_code=400, detail="Desconto só existe em cotação de venda")


def _exigir_todos_os_precos(cotacao: Cotacao) -> None:
    sem_preco = [i.produto_id for i in cotacao.itens if i.preco_unitario is None]
    if sem_preco:
        raise HTTPException(
            status_code=400,
            detail=f"Todos os itens precisam de preço para esta etapa. Sem preço: produto(s) {sem_preco}",
        )


def _observacao_do_pedido(cotacao: Cotacao) -> str:
    base = f"Gerado da cotação #{cotacao.id}"
    if cotacao.observacao:
        base = f"{base} - {cotacao.observacao}"
    return base[:255]


# ---------- rotas ----------

@router.post("/", response_model=CotacaoResponse)
def criar_cotacao(
    dados: CotacaoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    _validar_parte(db, dados.tipo, dados.fornecedor_id, dados.cliente_id)
    _validar_forma(db, dados.forma_pagamento_id)
    _validar_itens(db, dados.tipo, dados.itens)

    cotacao = Cotacao(
        tipo=dados.tipo,
        fornecedor_id=dados.fornecedor_id,
        cliente_id=dados.cliente_id,
        usuario_id=usuario.id,
        forma_pagamento_id=dados.forma_pagamento_id,
        data_cotacao=datetime.now(),
        validade=dados.validade,
        status="rascunho",
        observacao=dados.observacao,
        itens=[
            ItemCotacao(
                produto_id=i.produto_id, quantidade=i.quantidade,
                preco_unitario=i.preco_unitario, desconto=i.desconto, observacao=i.observacao,
            )
            for i in dados.itens
        ],
    )
    db.add(cotacao)
    db.commit()
    db.refresh(cotacao)
    return cotacao


@router.get("/", response_model=List[CotacaoResponse])
def listar_cotacoes(
    tipo: Optional[str] = None,
    status: Optional[str] = None,
    fornecedor_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Cotacao)
    if tipo:
        query = query.filter(Cotacao.tipo == tipo)
    if status:
        query = query.filter(Cotacao.status == status)
    if fornecedor_id:
        query = query.filter(Cotacao.fornecedor_id == fornecedor_id)
    if cliente_id:
        query = query.filter(Cotacao.cliente_id == cliente_id)
    return query.order_by(Cotacao.id.desc()).all()


@router.get("/comparativo/{produto_id}", response_model=List[ComparativoFornecedor])
def comparar_precos_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Compara o preço de um produto entre fornecedores, do menor para o maior.
    Considera só cotações de COMPRA já respondidas (recebida ou aprovada) e itens com preço:
    rascunhos, cotações ainda sem resposta e recusadas não entram na comparação.
    """
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    return (
        db.query(
            Fornecedor.id.label("fornecedor_id"),
            Fornecedor.nome.label("fornecedor_nome"),
            Cotacao.id.label("cotacao_id"),
            Cotacao.status.label("status"),
            ItemCotacao.preco_unitario,
            ItemCotacao.quantidade,
            Cotacao.data_cotacao,
        )
        .join(Cotacao, Cotacao.fornecedor_id == Fornecedor.id)
        .join(ItemCotacao, ItemCotacao.cotacao_id == Cotacao.id)
        .filter(
            ItemCotacao.produto_id == produto_id,
            ItemCotacao.preco_unitario.isnot(None),
            Cotacao.tipo == "compra",
            Cotacao.status.in_(("recebida", "aprovada")),
        )
        .order_by(ItemCotacao.preco_unitario.asc(), Cotacao.data_cotacao.desc())
        .all()
    )


@router.get("/{cotacao_id}", response_model=CotacaoResponse)
def buscar_cotacao(cotacao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cotacao = db.query(Cotacao).filter(Cotacao.id == cotacao_id).first()
    if not cotacao:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    return cotacao


@router.put("/{cotacao_id}", response_model=CotacaoResponse)
def atualizar_cotacao(
    cotacao_id: int,
    dados: CotacaoUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    cotacao = _travar_cotacao(db, cotacao_id)
    if cotacao.status not in STATUS_EDITAVEIS:
        raise HTTPException(status_code=400, detail=f"Cotação '{cotacao.status}' não pode mais ser alterada")

    enviados = dados.model_fields_set
    if "forma_pagamento_id" in enviados:
        _validar_forma(db, dados.forma_pagamento_id)
        cotacao.forma_pagamento_id = dados.forma_pagamento_id
    if "validade" in enviados:
        cotacao.validade = dados.validade
    if "observacao" in enviados:
        cotacao.observacao = dados.observacao

    if dados.itens is not None:
        _validar_itens(db, cotacao.tipo, dados.itens)
        # Atualiza por produto: mantém as linhas que continuam, cria as novas e remove as que saíram
        atuais = {i.produto_id: i for i in cotacao.itens}
        novos_ids = {i.produto_id for i in dados.itens}
        for produto_id, item in atuais.items():
            if produto_id not in novos_ids:
                cotacao.itens.remove(item)
        for novo in dados.itens:
            if novo.produto_id in atuais:
                existente = atuais[novo.produto_id]
                existente.quantidade = novo.quantidade
                existente.preco_unitario = novo.preco_unitario
                existente.desconto = novo.desconto
                existente.observacao = novo.observacao
            else:
                cotacao.itens.append(ItemCotacao(
                    produto_id=novo.produto_id, quantidade=novo.quantidade,
                    preco_unitario=novo.preco_unitario, desconto=novo.desconto, observacao=novo.observacao,
                ))

    if cotacao.status == "recebida":
        _exigir_todos_os_precos(cotacao)

    db.commit()
    db.refresh(cotacao)
    return cotacao


@router.patch("/{cotacao_id}/status", response_model=CotacaoResponse)
def atualizar_status_cotacao(
    cotacao_id: int,
    dados: CotacaoUpdateStatus,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    cotacao = _travar_cotacao(db, cotacao_id)

    novo = dados.status
    if novo not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail="Status inválido")
    if novo == "aprovada":
        raise HTTPException(status_code=400, detail="Para aprovar use POST /cotacoes/{id}/aprovar: a aprovação gera o pedido")
    if novo == cotacao.status:
        raise HTTPException(status_code=400, detail=f"Cotação já está com status '{novo}'")
    if novo not in TRANSICOES[cotacao.tipo].get(cotacao.status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Transição inválida em cotação de {cotacao.tipo}: '{cotacao.status}' → '{novo}'",
        )

    if novo == "recebida":
        _exigir_todos_os_precos(cotacao)

    cotacao.status = novo
    db.commit()
    db.refresh(cotacao)
    return cotacao


@router.post("/{cotacao_id}/aprovar", response_model=AprovacaoResponse)
def aprovar_cotacao(
    cotacao_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """
    Aprova a cotação E gera o pedido correspondente, tudo em uma única transação:
    cotação de compra gera pedido de compra; cotação de venda gera pedido de venda (reservando estoque).
    Se o pedido não puder ser criado (por exemplo, venda sem estoque), nada é gravado e a cotação continua como estava.
    """
    cotacao = _travar_cotacao(db, cotacao_id)

    status_exigido = "recebida" if cotacao.tipo == "compra" else "enviada"
    if cotacao.status != status_exigido:
        raise HTTPException(
            status_code=400,
            detail=f"Cotação de {cotacao.tipo} só pode ser aprovada quando está '{status_exigido}'. Status atual: '{cotacao.status}'",
        )
    if cotacao.validade is not None and cotacao.validade < date.today():
        raise HTTPException(status_code=400, detail=f"A cotação venceu em {cotacao.validade.isoformat()}")
    _exigir_todos_os_precos(cotacao)
    if cotacao.forma_pagamento_id is None:
        raise HTTPException(
            status_code=400,
            detail="Defina a forma de pagamento da cotação (PUT /cotacoes/{id}) antes de aprovar: "
                   "é dela que saem as parcelas do financeiro",
        )

    try:
        if cotacao.tipo == "compra":
            pedido = registrar_pedido_compra(db, usuario.id, PedidoCompraCreate(
                fornecedor_id=cotacao.fornecedor_id,
                forma_pagamento_id=cotacao.forma_pagamento_id,
                observacao=_observacao_do_pedido(cotacao),
                itens=[
                    ItemPedidoCompraCreate(produto_id=i.produto_id, quantidade=i.quantidade, preco_unitario=i.preco_unitario)
                    for i in cotacao.itens
                ],
            ))
            cotacao.pedido_compra_id = pedido.id
        else:
            pedido = registrar_pedido_venda(db, usuario.id, PedidoVendaCreate(
                cliente_id=cotacao.cliente_id,
                forma_pagamento_id=cotacao.forma_pagamento_id,
                observacao=_observacao_do_pedido(cotacao),
                itens=[
                    ItemPedidoVendaCreate(
                        produto_id=i.produto_id, quantidade=i.quantidade,
                        preco_unitario=i.preco_unitario, desconto=i.desconto,
                    )
                    for i in cotacao.itens
                ],
            ))
            cotacao.pedido_venda_id = pedido.id
    except ValidationError as erro:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Os dados da cotação não formam um pedido válido: {erro.errors()[0]['msg']}")

    cotacao.status = "aprovada"
    pedido_id = pedido.id
    db.commit()
    db.refresh(cotacao)
    return AprovacaoResponse(cotacao=cotacao, pedido_tipo=cotacao.tipo, pedido_id=pedido_id)


@router.delete("/{cotacao_id}")
def excluir_cotacao(cotacao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cotacao = _travar_cotacao(db, cotacao_id)
    if cotacao.pedido_venda_id or cotacao.pedido_compra_id:
        raise HTTPException(
            status_code=400,
            detail="Esta cotação já gerou um pedido e não pode ser excluída (o pedido guarda a referência a ela)",
        )
    db.delete(cotacao)   # os itens saem junto (cascade)
    db.commit()
    return {"message": "Cotação excluída com sucesso"}
