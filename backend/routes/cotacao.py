from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Cotacao, ItemCotacao, Fornecedor, Produto, Usuario
from schemas.cotacao import (
    CotacaoCreate, CotacaoUpdateStatus, CotacaoResponse, ComparativoFornecedor
)
from core.security import get_current_user
from typing import List
from datetime import datetime

router = APIRouter(prefix="/cotacoes", tags=["Cotações"])


@router.post("/", response_model=CotacaoResponse)
def criar_cotacao(
    dados: CotacaoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    if not dados.itens:
        raise HTTPException(status_code=400, detail="A cotação deve conter ao menos um item")

    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == dados.fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")

    for item in dados.itens:
        if not db.query(Produto).filter(Produto.id == item.produto_id).first():
            raise HTTPException(status_code=404, detail=f"Produto {item.produto_id} não encontrado")

    cotacao = Cotacao(
        fornecedor_id=dados.fornecedor_id,
        usuario_id=usuario.id,
        data_cotacao=datetime.now(),
        status=dados.status,
        observacao=dados.observacao
    )
    db.add(cotacao)
    db.flush()

    for item in dados.itens:
        db.add(ItemCotacao(
            cotacao_id=cotacao.id,
            produto_id=item.produto_id,
            preco_unitario=item.preco_unitario,
            quantidade_referencia=item.quantidade_referencia,
            observacao=item.observacao
        ))

    db.commit()
    db.refresh(cotacao)
    return cotacao


@router.get("/", response_model=List[CotacaoResponse])
def listar_cotacoes(
    fornecedor_id: int = None,
    status: str = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(Cotacao)
    if fornecedor_id:
        query = query.filter(Cotacao.fornecedor_id == fornecedor_id)
    if status:
        query = query.filter(Cotacao.status == status)
    return query.all()


@router.get("/comparativo/{produto_id}", response_model=List[ComparativoFornecedor])
def comparar_precos_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    """
    Retorna todas as cotações registradas para um produto específico,
    com o nome do fornecedor, ordenadas do menor para o maior preço.
    Permite identificar rapidamente o fornecedor com melhor custo-benefício.
    """
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    resultados = (
        db.query(
            Fornecedor.id.label("fornecedor_id"),
            Fornecedor.nome.label("fornecedor_nome"),
            Cotacao.id.label("cotacao_id"),
            ItemCotacao.preco_unitario,
            ItemCotacao.quantidade_referencia,
            Cotacao.data_cotacao
        )
        .join(Cotacao, Cotacao.fornecedor_id == Fornecedor.id)
        .join(ItemCotacao, ItemCotacao.cotacao_id == Cotacao.id)
        .filter(ItemCotacao.produto_id == produto_id)
        .order_by(ItemCotacao.preco_unitario.asc())
        .all()
    )

    return resultados


@router.get("/{cotacao_id}", response_model=CotacaoResponse)
def buscar_cotacao(cotacao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cotacao = db.query(Cotacao).filter(Cotacao.id == cotacao_id).first()
    if not cotacao:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    return cotacao


@router.patch("/{cotacao_id}/status", response_model=CotacaoResponse)
def atualizar_status_cotacao(
    cotacao_id: int,
    dados: CotacaoUpdateStatus,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    cotacao = db.query(Cotacao).filter(Cotacao.id == cotacao_id).first()
    if not cotacao:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")

    if dados.status not in ("rascunho", "enviada", "recebida", "aprovada"):
        raise HTTPException(status_code=400, detail="Status inválido")

    cotacao.status = dados.status
    db.commit()
    db.refresh(cotacao)
    return cotacao


@router.delete("/{cotacao_id}")
def excluir_cotacao(cotacao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cotacao = db.query(Cotacao).filter(Cotacao.id == cotacao_id).first()
    if not cotacao:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")

    db.query(ItemCotacao).filter(ItemCotacao.cotacao_id == cotacao.id).delete()
    db.delete(cotacao)
    db.commit()
    return {"message": "Cotação excluída com sucesso"}