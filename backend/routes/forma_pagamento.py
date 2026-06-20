from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import FormaPagamento
from schemas.forma_pagamento import FormaPagamentoCreate, FormaPagamentoUpdate, FormaPagamentoResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/formas-pagamento", tags=["Formas de Pagamento"])

@router.post("/", response_model=FormaPagamentoResponse)
def criar_forma_pagamento(dados: FormaPagamentoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = FormaPagamento(**dados.model_dump())
    db.add(forma)
    db.commit()
    db.refresh(forma)
    return forma

@router.get("/", response_model=List[FormaPagamentoResponse])
def listar_formas_pagamento(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(FormaPagamento).all()
    return db.query(FormaPagamento).filter(FormaPagamento.ativo == True).all()

@router.get("/inativos", response_model=List[FormaPagamentoResponse])
def listar_formas_pagamento_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(FormaPagamento).filter(FormaPagamento.ativo == False).all()

@router.get("/{forma_id}", response_model=FormaPagamentoResponse)
def buscar_forma_pagamento(forma_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
    return forma

@router.put("/{forma_id}", response_model=FormaPagamentoResponse)
def atualizar_forma_pagamento(forma_id: int, dados: FormaPagamentoUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")

    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(forma, campo, valor)

    db.commit()
    db.refresh(forma)
    return forma

@router.delete("/{forma_id}")
def desativar_forma_pagamento(forma_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")

    forma.ativo = False
    db.commit()
    return {"message": f"Forma de pagamento '{forma.descricao}' desativada com sucesso"}