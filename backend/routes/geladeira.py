from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models import Geladeira, Cliente, ClienteEndereco
from schemas.geladeira import GeladeiraCreate, GeladeiraUpdate, GeladeiraResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/geladeiras", tags=["Geladeiras"])

MSG_SERIE_DUPLICADA = "Número de série já cadastrado"


def _numero_serie_duplicado(db: Session, numero_serie: str, ignorar_id: int = None) -> bool:
    query = db.query(Geladeira).filter(Geladeira.numero_serie == numero_serie)
    if ignorar_id is not None:
        query = query.filter(Geladeira.id != ignorar_id)
    return query.first() is not None


def _validar_endereco_do_cliente(db: Session, cliente_id: int, endereco_id: int):
    # Usado só quando o endereço está sendo ESCOLHIDO agora: precisa existir,
    # ser do cliente da geladeira e estar ativo.
    endereco = db.query(ClienteEndereco).filter(ClienteEndereco.id == endereco_id).first()
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado")
    if endereco.cliente_id != cliente_id:
        raise HTTPException(status_code=400, detail="O endereço informado não pertence ao cliente selecionado")
    if not endereco.ativo:
        raise HTTPException(status_code=400, detail="O endereço selecionado está inativo")


@router.post("/", response_model=GeladeiraResponse)
def criar_geladeira(dados: GeladeiraCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    _validar_endereco_do_cliente(db, dados.cliente_id, dados.endereco_id)

    if dados.numero_serie and _numero_serie_duplicado(db, dados.numero_serie):
        raise HTTPException(status_code=400, detail=MSG_SERIE_DUPLICADA)

    geladeira = Geladeira(**dados.model_dump())
    db.add(geladeira)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_SERIE_DUPLICADA)
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

    atualizacoes = dados.model_dump(exclude_none=True)

    cliente_final = atualizacoes.get("cliente_id", geladeira.cliente_id)
    cliente_mudou = cliente_final != geladeira.cliente_id

    if "cliente_id" in atualizacoes:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_final).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # O endereço antigo pertence ao cliente antigo: ao trocar o cliente, é preciso escolher um novo
    if cliente_mudou and "endereco_id" not in atualizacoes:
        raise HTTPException(
            status_code=400,
            detail="Ao trocar o cliente da geladeira, informe também o endereco_id (um endereço do novo cliente)"
        )

    # "Ativo" e "pertence ao cliente" só são exigidos para o endereço que está sendo escolhido agora;
    # uma geladeira que já aponta para um endereço depois desativado continua editável.
    endereco_mudou = "endereco_id" in atualizacoes and atualizacoes["endereco_id"] != geladeira.endereco_id
    if cliente_mudou or endereco_mudou:
        _validar_endereco_do_cliente(db, cliente_final, atualizacoes["endereco_id"])

    if "numero_serie" in atualizacoes and _numero_serie_duplicado(db, atualizacoes["numero_serie"], ignorar_id=geladeira_id):
        raise HTTPException(status_code=400, detail=MSG_SERIE_DUPLICADA)

    for campo, valor in atualizacoes.items():
        setattr(geladeira, campo, valor)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_SERIE_DUPLICADA)
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