from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import Subcategoria, Categoria, Produto
from schemas.subcategoria import SubcategoriaCreate, SubcategoriaUpdate, SubcategoriaResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/subcategorias", tags=["Subcategorias"])

MSG_DUPLICADA = "Já existe uma subcategoria com esse nome nessa categoria (ativa ou inativa)"
MSG_COM_PRODUTOS = (
    "Não é possível mudar a categoria de uma subcategoria que já possui "
    "produtos vinculados (ativos ou inativos)"
)


def _nome_duplicado(db: Session, categoria_id: int, nome: str, ignorar_id: int = None) -> bool:
    # A duplicidade vale só dentro da mesma categoria, ativas e inativas
    query = db.query(Subcategoria).filter(
        Subcategoria.categoria_id == categoria_id,
        Subcategoria.nome == nome
    )
    if ignorar_id is not None:
        query = query.filter(Subcategoria.id != ignorar_id)
    return query.first() is not None


def _validar_categoria_ativa(db: Session, categoria_id: int):
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    if not categoria.ativo:
        raise HTTPException(status_code=400, detail="A categoria selecionada está inativa")


def _tem_produtos_vinculados(db: Session, subcategoria_id: int) -> bool:
    # Conta produtos ativos e inativos: um produto desativado pode ser reativado
    # depois, e não pode voltar com categoria e subcategoria incoerentes.
    return db.query(Produto).filter(Produto.subcategoria_id == subcategoria_id).first() is not None


@router.post("/", response_model=SubcategoriaResponse)
def criar_subcategoria(dados: SubcategoriaCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    _validar_categoria_ativa(db, dados.categoria_id)

    if _nome_duplicado(db, dados.categoria_id, dados.nome):
        raise HTTPException(status_code=400, detail=MSG_DUPLICADA)

    subcategoria = Subcategoria(**dados.model_dump())
    db.add(subcategoria)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_DUPLICADA)
    db.refresh(subcategoria)
    return subcategoria


@router.get("/", response_model=List[SubcategoriaResponse])
def listar_subcategorias(
    categoria_id: int = None,
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(Subcategoria)
    if categoria_id:
        query = query.filter(Subcategoria.categoria_id == categoria_id)
    if not incluir_inativos:
        query = query.filter(Subcategoria.ativo == True)
    return query.all()


@router.get("/inativos", response_model=List[SubcategoriaResponse])
def listar_subcategorias_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Subcategoria).filter(Subcategoria.ativo == False).all()


@router.get("/{subcategoria_id}", response_model=SubcategoriaResponse)
def buscar_subcategoria(subcategoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    subcategoria = db.query(Subcategoria).filter(Subcategoria.id == subcategoria_id).first()
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria não encontrada")
    return subcategoria


@router.put("/{subcategoria_id}", response_model=SubcategoriaResponse)
def atualizar_subcategoria(subcategoria_id: int, dados: SubcategoriaUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    subcategoria = db.query(Subcategoria).filter(Subcategoria.id == subcategoria_id).first()
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria não encontrada")

    atualizacoes = dados.model_dump(exclude_none=True)

    categoria_final = atualizacoes.get("categoria_id", subcategoria.categoria_id)
    nome_final = atualizacoes.get("nome", subcategoria.nome)

    # Regras que só valem quando a subcategoria está sendo MOVIDA para outra categoria
    if categoria_final != subcategoria.categoria_id:
        _validar_categoria_ativa(db, categoria_final)
        if _tem_produtos_vinculados(db, subcategoria_id):
            raise HTTPException(status_code=400, detail=MSG_COM_PRODUTOS)

    if ("nome" in atualizacoes or "categoria_id" in atualizacoes) and \
            _nome_duplicado(db, categoria_final, nome_final, ignorar_id=subcategoria_id):
        raise HTTPException(status_code=400, detail=MSG_DUPLICADA)

    for campo, valor in atualizacoes.items():
        setattr(subcategoria, campo, valor)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_DUPLICADA)
    db.refresh(subcategoria)
    return subcategoria


@router.delete("/{subcategoria_id}")
def desativar_subcategoria(subcategoria_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    subcategoria = db.query(Subcategoria).filter(Subcategoria.id == subcategoria_id).first()
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria não encontrada")

    subcategoria.ativo = False
    db.commit()
    return {"message": f"Subcategoria {subcategoria.nome} desativada com sucesso"}