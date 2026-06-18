from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Fornecedor
from schemas.fornecedor import FornecedorCreate, FornecedorUpdate, FornecedorResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/fornecedores", tags=["Fornecedores"])

@router.post("/", response_model=FornecedorResponse)
def criar_fornecedor(dados: FornecedorCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if db.query(Fornecedor).filter(Fornecedor.cnpj == dados.cnpj).first():
        raise HTTPException(status_code=400, detail="CNPJ já cadastrado")
    fornecedor = Fornecedor(**dados.model_dump())
    db.add(fornecedor)
    db.commit()
    db.refresh(fornecedor)
    return fornecedor

@router.get("/", response_model=List[FornecedorResponse])
def listar_fornecedores(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(Fornecedor).all()
    return db.query(Fornecedor).filter(Fornecedor.ativo == True).all()


@router.get("/inativos", response_model=List[FornecedorResponse])
def listar_fornecedores_inativos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Fornecedor).filter(Fornecedor.ativo == False).all()

@router.get("/{fornecedor_id}", response_model=FornecedorResponse)
def buscar_fornecedor(fornecedor_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return fornecedor

@router.put("/{fornecedor_id}", response_model=FornecedorResponse)
def atualizar_fornecedor(fornecedor_id: int, dados: FornecedorUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")

    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(fornecedor, campo, valor)

    db.commit()
    db.refresh(fornecedor)
    return fornecedor

@router.delete("/{fornecedor_id}")
def desativar_fornecedor(fornecedor_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    fornecedor = db.query(Fornecedor).filter(Fornecedor.id == fornecedor_id).first()
    if not fornecedor:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")

    fornecedor.ativo = False
    db.commit()
    return {"message": f"Fornecedor {fornecedor.nome} desativado com sucesso"}