from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import HistoricoManutencao, Geladeira, Usuario
from schemas.historico_manutencao import HistoricoManutencaoCreate, HistoricoManutencaoResponse
from core.security import get_current_user
from typing import List
from datetime import datetime

router = APIRouter(prefix="/manutencoes", tags=["Histórico de Manutenção"])


@router.post("/", response_model=HistoricoManutencaoResponse)
def criar_manutencao(
    dados: HistoricoManutencaoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user)
):
    geladeira = db.query(Geladeira).filter(Geladeira.id == dados.geladeira_id).first()
    if not geladeira:
        raise HTTPException(status_code=404, detail="Geladeira não encontrada")

    if dados.tipo not in ("preventiva", "corretiva"):
        raise HTTPException(status_code=400, detail="Tipo deve ser 'preventiva' ou 'corretiva'")

    manutencao = HistoricoManutencao(
        geladeira_id=dados.geladeira_id,
        usuario_id=usuario.id,
        data=dados.data or datetime.now(),
        tipo=dados.tipo,
        descricao=dados.descricao,
        custo=dados.custo
    )
    db.add(manutencao)
    db.commit()
    db.refresh(manutencao)
    return manutencao


@router.get("/", response_model=List[HistoricoManutencaoResponse])
def listar_manutencoes(
    geladeira_id: int = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(HistoricoManutencao)
    if geladeira_id:
        query = query.filter(HistoricoManutencao.geladeira_id == geladeira_id)
    return query.order_by(HistoricoManutencao.data.desc()).all()


@router.get("/{manutencao_id}", response_model=HistoricoManutencaoResponse)
def buscar_manutencao(manutencao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    manutencao = db.query(HistoricoManutencao).filter(HistoricoManutencao.id == manutencao_id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Registro de manutenção não encontrado")
    return manutencao


@router.delete("/{manutencao_id}")
def excluir_manutencao(manutencao_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    manutencao = db.query(HistoricoManutencao).filter(HistoricoManutencao.id == manutencao_id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Registro de manutenção não encontrado")

    db.delete(manutencao)
    db.commit()
    return {"message": "Registro de manutenção excluído com sucesso"}