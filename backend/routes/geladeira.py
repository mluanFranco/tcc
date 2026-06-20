from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Geladeira, Cliente
from schemas.geladeira import GeladeiraCreate, GeladeiraUpdate, GeladeiraResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/geladeiras", tags=["Geladeiras"])


@router.post("/", response_model=GeladeiraResponse)
def criar_geladeira(dados: GeladeiraCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    if dados.numero_serie:
        existente = db.query(Geladeira).filter(Geladeira.numero_serie == dados.numero_serie).first()
        if existente:
            raise HTTPException(status_code=400, detail="Número de série já cadastrado")

    geladeira = Geladeira(**dados.model_dump())
    db.add(geladeira)
    db.commit()
    db.refresh(geladeira)
    return geladeira


@router.get("/", response_model=List[GeladeiraResponse])
def listar_geladeiras(
    cliente_id: int = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(Geladeira).filter(Geladeira.status != "desativada")
    if cliente_id:
        query = query.filter(Geladeira.cliente_id == cliente_id)
    return query.all()


@router.get("/desativadas", response_model=List[GeladeiraResponse])
def listar_geladeiras_desativadas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Geladeira).filter(Geladeira.status == "desativada").all()


@router.get("/{geladeira_id}", response_model=GeladeiraResponse)
def buscar_geladeira(geladeira_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    geladeira = db.query(Geladeira).filter(Geladeira.id == geladeira_id).first()
    if not geladeira:
        raise HTTPException(status_code=404, detail="Geladeira não encontrada")
    return geladeira


@router.put("/{geladeira_id}", response_model=GeladeiraResponse)
def atualizar_geladeira(geladeira_id: int, dados: GeladeiraUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    geladeira = db.query(Geladeira).filter(Geladeira.id == geladeira_id).first()
    if not geladeira:
        raise HTTPException(status_code=404, detail="Geladeira não encontrada")

    if dados.cliente_id is not None:
        cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")

    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(geladeira, campo, valor)

    db.commit()
    db.refresh(geladeira)
    return geladeira


@router.delete("/{geladeira_id}")
def desativar_geladeira(geladeira_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    geladeira = db.query(Geladeira).filter(Geladeira.id == geladeira_id).first()
    if not geladeira:
        raise HTTPException(status_code=404, detail="Geladeira não encontrada")

    geladeira.status = "desativada"
    db.commit()
    return {"message": f"Geladeira {geladeira.numero_serie or geladeira.id} desativada com sucesso"}