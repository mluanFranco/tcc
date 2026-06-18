from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Produto
from schemas.produto import ProdutoCreate, ProdutoUpdate, ProdutoResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/produtos", tags=["Produtos"])

@router.post("/", response_model=ProdutoResponse)
def criar_produto(dados: ProdutoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = Produto(**dados.model_dump())
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return produto

@router.get("/", response_model=List[ProdutoResponse])
def listar_produtos(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(Produto).all()
    return db.query(Produto).filter(Produto.ativo == True).all()


@router.get("/inativos", response_model=List[ProdutoResponse])
def listar_produtos_inativos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Produto).filter(Produto.ativo == False).all()

@router.get("/estoque-baixo", response_model=List[ProdutoResponse])
def produtos_estoque_baixo(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Produto).filter(
        Produto.ativo == True,
        Produto.estoque_atual <= Produto.estoque_minimo
    ).all()

@router.get("/{produto_id}", response_model=ProdutoResponse)
def buscar_produto(produto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return produto

@router.put("/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(produto_id: int, dados: ProdutoUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(produto, campo, valor)

    db.commit()
    db.refresh(produto)
    return produto

@router.delete("/{produto_id}")
def desativar_produto(produto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    produto.ativo = False
    db.commit()
    return {"message": f"Produto {produto.nome} desativado com sucesso"}