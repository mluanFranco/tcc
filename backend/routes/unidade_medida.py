from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import UnidadeMedida
from schemas.unidade_medida import UnidadeMedidaCreate, UnidadeMedidaUpdate, UnidadeMedidaResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/unidades-medida", tags=["Unidades de Medida"])

MSG_NOME = "Já existe uma unidade de medida com esse nome (ativa ou inativa)"
MSG_SIGLA = "Já existe uma unidade de medida com essa sigla (ativa ou inativa)"


def _campo_duplicado(db: Session, coluna, valor: str, ignorar_id: int = None) -> bool:
    # Considera ativas e inativas, ignorando o próprio registro (no caso de edição)
    query = db.query(UnidadeMedida).filter(coluna == valor)
    if ignorar_id is not None:
        query = query.filter(UnidadeMedida.id != ignorar_id)
    return query.first() is not None


@router.post("/", response_model=UnidadeMedidaResponse)
def criar_unidade_medida(dados: UnidadeMedidaCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if _campo_duplicado(db, UnidadeMedida.nome, dados.nome):
        raise HTTPException(status_code=400, detail=MSG_NOME)
    if _campo_duplicado(db, UnidadeMedida.sigla, dados.sigla):
        raise HTTPException(status_code=400, detail=MSG_SIGLA)

    unidade = UnidadeMedida(**dados.model_dump())
    db.add(unidade)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_SIGLA)
    db.refresh(unidade)
    return unidade


@router.get("/", response_model=List[UnidadeMedidaResponse])
def listar_unidades_medida(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if incluir_inativos:
        return db.query(UnidadeMedida).all()
    return db.query(UnidadeMedida).filter(UnidadeMedida.ativo == True).all()


@router.get("/inativos", response_model=List[UnidadeMedidaResponse])
def listar_unidades_medida_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(UnidadeMedida).filter(UnidadeMedida.ativo == False).all()


@router.get("/{unidade_id}", response_model=UnidadeMedidaResponse)
def buscar_unidade_medida(unidade_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    unidade = db.query(UnidadeMedida).filter(UnidadeMedida.id == unidade_id).first()
    if not unidade:
        raise HTTPException(status_code=404, detail="Unidade de medida não encontrada")
    return unidade


@router.put("/{unidade_id}", response_model=UnidadeMedidaResponse)
def atualizar_unidade_medida(unidade_id: int, dados: UnidadeMedidaUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    unidade = db.query(UnidadeMedida).filter(UnidadeMedida.id == unidade_id).first()
    if not unidade:
        raise HTTPException(status_code=404, detail="Unidade de medida não encontrada")

    atualizacoes = dados.model_dump(exclude_none=True)

    if "nome" in atualizacoes and _campo_duplicado(db, UnidadeMedida.nome, atualizacoes["nome"], ignorar_id=unidade_id):
        raise HTTPException(status_code=400, detail=MSG_NOME)
    if "sigla" in atualizacoes and _campo_duplicado(db, UnidadeMedida.sigla, atualizacoes["sigla"], ignorar_id=unidade_id):
        raise HTTPException(status_code=400, detail=MSG_SIGLA)

    for campo, valor in atualizacoes.items():
        setattr(unidade, campo, valor)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_SIGLA)
    db.refresh(unidade)
    return unidade


@router.delete("/{unidade_id}")
def desativar_unidade_medida(unidade_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    unidade = db.query(UnidadeMedida).filter(UnidadeMedida.id == unidade_id).first()
    if not unidade:
        raise HTTPException(status_code=404, detail="Unidade de medida não encontrada")

    unidade.ativo = False
    db.commit()
    return {"message": f"Unidade de medida {unidade.nome} desativada com sucesso"}