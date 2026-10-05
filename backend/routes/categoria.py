from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import Categoria
from schemas.categoria import CategoriaCreate, CategoriaUpdate, CategoriaResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/categorias", tags=["Categorias"])


def _nome_duplicado(db: Session, nome: str, ignorar_id: int = None) -> bool:
    # Considera ativas e inativas, ignorando o próprio registro (no caso de edição)
    query = db.query(Categoria).filter(Categoria.nome == nome)
    if ignorar_id is not None:
        query = query.filter(Categoria.id != ignorar_id)
    return query.first() is not None


@router.post("/", response_model=CategoriaResponse)
def criar_categoria(dados: CategoriaCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if _nome_duplicado(db, dados.nome):
        raise HTTPException(status_code=400, detail="Já existe uma categoria com esse nome (ativa ou inativa)")

    categoria = Categoria(**dados.model_dump())
    db.add(categoria)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Já existe uma categoria com esse nome (ativa ou inativa)")
    db.refresh(categoria)
    return categoria


@router.get("/", response_model=List[CategoriaResponse])
def listar_categorias(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(Categoria).all()
    return db.query(Categoria).filter(Categoria.ativo == True).all()


@router.get("/inativos", response_model=List[CategoriaResponse])
def listar_categorias_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Categoria).filter(Categoria.ativo == False).all()


@router.get("/{categoria_id}", response_model=CategoriaResponse)
def buscar_categoria(categoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return categoria


@router.put("/{categoria_id}", response_model=CategoriaResponse)
def atualizar_categoria(categoria_id: int, dados: CategoriaUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")

    atualizacoes = dados.model_dump(exclude_none=True)

    if "nome" in atualizacoes and _nome_duplicado(db, atualizacoes["nome"], ignorar_id=categoria_id):
        raise HTTPException(status_code=400, detail="Já existe uma categoria com esse nome (ativa ou inativa)")

    for campo, valor in atualizacoes.items():
        setattr(categoria, campo, valor)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Já existe uma categoria com esse nome (ativa ou inativa)")
    db.refresh(categoria)
    return categoria


@router.delete("/{categoria_id}")
def desativar_categoria(categoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")

    categoria.ativo = False
    db.commit()
    return {"message": f"Categoria {categoria.nome} desativada com sucesso"}