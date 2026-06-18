from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Cliente
from schemas.cliente import ClienteCreate, ClienteUpdate, ClienteResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/clientes", tags=["Clientes"])

@router.post("/", response_model=ClienteResponse)
def criar_cliente(dados: ClienteCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if db.query(Cliente).filter(Cliente.cpf_cnpj == dados.cpf_cnpj).first():
        raise HTTPException(status_code=400, detail="CPF/CNPJ já cadastrado")
    cliente = Cliente(**dados.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente

@router.get("/", response_model=List[ClienteResponse])
def listar_clientes(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(Cliente).all()
    return db.query(Cliente).filter(Cliente.ativo == True).all()


@router.get("/inativos", response_model=List[ClienteResponse])
def listar_clientes_inativos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Cliente).filter(Cliente.ativo == False).all()

@router.get("/{cliente_id}", response_model=ClienteResponse)
def buscar_cliente(cliente_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente

@router.put("/{cliente_id}", response_model=ClienteResponse)
def atualizar_cliente(cliente_id: int, dados: ClienteUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(cliente, campo, valor)

    db.commit()
    db.refresh(cliente)
    return cliente

@router.delete("/{cliente_id}")
def desativar_cliente(cliente_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    cliente.ativo = False
    db.commit()
    return {"message": f"Cliente {cliente.nome} desativado com sucesso"}