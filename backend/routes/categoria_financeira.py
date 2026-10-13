from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models import CategoriaFinanceira
from schemas.categoria_financeira import (
    CategoriaFinanceiraCreate, CategoriaFinanceiraUpdate, CategoriaFinanceiraResponse,
)
from core.security import get_current_user
from typing import List, Optional

router = APIRouter(prefix="/categorias-financeiras", tags=["Categorias Financeiras"])


def _buscar_ou_404(db: Session, categoria_id: int) -> CategoriaFinanceira:
    categoria = db.query(CategoriaFinanceira).filter(CategoriaFinanceira.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria financeira não encontrada")
    return categoria


def _garantir_nome_livre(db: Session, nome: str, tipo: str, ignorar_id: Optional[int] = None) -> None:
    query = db.query(CategoriaFinanceira).filter(
        func.lower(CategoriaFinanceira.nome) == nome.lower(), CategoriaFinanceira.tipo == tipo
    )
    if ignorar_id is not None:
        query = query.filter(CategoriaFinanceira.id != ignorar_id)
    if query.first():
        raise HTTPException(status_code=400, detail=f"Já existe uma categoria '{nome}' para títulos a {tipo}")


def _barrar_sistema(categoria: CategoriaFinanceira, acao: str) -> None:
    if categoria.sistema:
        raise HTTPException(
            status_code=400,
            detail=f"A categoria '{categoria.nome}' é do sistema (os pedidos usam ela) e não pode ser {acao}",
        )


@router.post("/", response_model=CategoriaFinanceiraResponse)
def criar_categoria(dados: CategoriaFinanceiraCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    _garantir_nome_livre(db, dados.nome, dados.tipo)
    categoria = CategoriaFinanceira(nome=dados.nome, tipo=dados.tipo, sistema=False, ativo=True)
    db.add(categoria)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()   # duas requisições simultâneas com o mesmo nome: a UNIQUE do banco barra a segunda
        raise HTTPException(status_code=400, detail=f"Já existe uma categoria '{dados.nome}' para títulos a {dados.tipo}")
    db.refresh(categoria)
    return categoria


@router.get("/", response_model=List[CategoriaFinanceiraResponse])
def listar_categorias(
    tipo: Optional[str] = Query(default=None, pattern="^(pagar|receber)$"),
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(CategoriaFinanceira)
    if tipo:
        query = query.filter(CategoriaFinanceira.tipo == tipo)
    if not incluir_inativos:
        query = query.filter(CategoriaFinanceira.ativo == True)
    return query.order_by(CategoriaFinanceira.tipo, CategoriaFinanceira.nome).all()


@router.get("/inativos", response_model=List[CategoriaFinanceiraResponse])
def listar_categorias_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return (
        db.query(CategoriaFinanceira).filter(CategoriaFinanceira.ativo == False)
        .order_by(CategoriaFinanceira.tipo, CategoriaFinanceira.nome).all()
    )


@router.get("/{categoria_id}", response_model=CategoriaFinanceiraResponse)
def buscar_categoria(categoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _buscar_ou_404(db, categoria_id)


@router.put("/{categoria_id}", response_model=CategoriaFinanceiraResponse)
def atualizar_categoria(
    categoria_id: int,
    dados: CategoriaFinanceiraUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    categoria = _buscar_ou_404(db, categoria_id)
    _barrar_sistema(categoria, "renomeada")
    _garantir_nome_livre(db, dados.nome, categoria.tipo, ignorar_id=categoria.id)
    categoria.nome = dados.nome
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Já existe uma categoria '{dados.nome}' para títulos a {categoria.tipo}")
    db.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}")
def desativar_categoria(categoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Desativa (não apaga): novos lançamentos não podem usá-la, os títulos já lançados continuam com ela."""
    categoria = _buscar_ou_404(db, categoria_id)
    _barrar_sistema(categoria, "desativada")
    categoria.ativo = False
    db.commit()
    return {"message": f"Categoria '{categoria.nome}' desativada com sucesso"}


@router.patch("/{categoria_id}/reativar", response_model=CategoriaFinanceiraResponse)
def reativar_categoria(categoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    categoria = _buscar_ou_404(db, categoria_id)
    categoria.ativo = True
    db.commit()
    db.refresh(categoria)
    return categoria
