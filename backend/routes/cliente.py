from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models import Cliente, ClienteEndereco
from schemas.cliente import ClienteCreate, ClienteUpdate, ClienteResponse
from schemas.endereco import EnderecoCreate, EnderecoUpdate, EnderecoResponse
from core.security import get_current_user
from core.validacoes import tipo_do_documento
from typing import List

router = APIRouter(prefix="/clientes", tags=["Clientes"])

MSG_DOCUMENTO_DUPLICADO = "CPF/CNPJ já cadastrado (em um cliente ativo ou inativo)"


# ---------------------------------------------------------------------------
# Funções de apoio
# ---------------------------------------------------------------------------

def _documento_duplicado(db: Session, documento: str, ignorar_id: int = None) -> bool:
    query = db.query(Cliente).filter(Cliente.cpf_cnpj == documento)
    if ignorar_id is not None:
        query = query.filter(Cliente.id != ignorar_id)
    return query.first() is not None


def _buscar_cliente_ou_404(db: Session, cliente_id: int) -> Cliente:
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


def _buscar_endereco_ou_404(db: Session, cliente_id: int, endereco_id: int) -> ClienteEndereco:
    # Filtra também pelo cliente: um endereço de outro cliente é tratado como inexistente
    endereco = db.query(ClienteEndereco).filter(
        ClienteEndereco.id == endereco_id,
        ClienteEndereco.cliente_id == cliente_id
    ).first()
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado para este cliente")
    return endereco


def _principal_ativo(db: Session, cliente_id: int, ignorar_id: int = None):
    query = db.query(ClienteEndereco).filter(
        ClienteEndereco.cliente_id == cliente_id,
        ClienteEndereco.tipo == "principal",
        ClienteEndereco.ativo == True
    )
    if ignorar_id is not None:
        query = query.filter(ClienteEndereco.id != ignorar_id)
    return query.first()


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------

@router.post("/", response_model=ClienteResponse)
def criar_cliente(dados: ClienteCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if _documento_duplicado(db, dados.cpf_cnpj):
        raise HTTPException(status_code=400, detail=MSG_DOCUMENTO_DUPLICADO)

    # Cliente e endereço principal são gravados juntos: ou entram os dois, ou nenhum.
    cliente = Cliente(**dados.model_dump(exclude={"endereco_principal"}))
    db.add(cliente)
    db.flush()  # gera o id do cliente para ligar o endereço
    db.add(ClienteEndereco(
        cliente_id=cliente.id,
        tipo="principal",
        **dados.endereco_principal.model_dump()
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_DOCUMENTO_DUPLICADO)
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
    return _buscar_cliente_ou_404(db, cliente_id)


@router.put("/{cliente_id}", response_model=ClienteResponse)
def atualizar_cliente(cliente_id: int, dados: ClienteUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = _buscar_cliente_ou_404(db, cliente_id)

    atualizacoes = dados.model_dump(exclude_none=True)

    if "cpf_cnpj" in atualizacoes and _documento_duplicado(db, atualizacoes["cpf_cnpj"], ignorar_id=cliente_id):
        raise HTTPException(status_code=400, detail=MSG_DOCUMENTO_DUPLICADO)

    # O tipo (PF/PJ) é sempre consequência do documento: não pode divergir dele
    tipo_final = tipo_do_documento(atualizacoes.get("cpf_cnpj", cliente.cpf_cnpj))
    if "tipo" in atualizacoes and tipo_final and atualizacoes["tipo"] != tipo_final:
        raise HTTPException(
            status_code=400,
            detail=f"O tipo informado ({atualizacoes['tipo']}) não corresponde ao documento do cliente ({tipo_final})."
        )
    if "cpf_cnpj" in atualizacoes:
        atualizacoes["tipo"] = tipo_final
    else:
        atualizacoes.pop("tipo", None)

    for campo, valor in atualizacoes.items():
        setattr(cliente, campo, valor)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=MSG_DOCUMENTO_DUPLICADO)
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}")
def desativar_cliente(cliente_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    cliente = _buscar_cliente_ou_404(db, cliente_id)

    cliente.ativo = False
    db.commit()
    return {"message": f"Cliente {cliente.nome} desativado com sucesso"}


# ---------------------------------------------------------------------------
# Endereços do cliente (um principal + quantos endereços de entrega forem necessários)
# ---------------------------------------------------------------------------

@router.get("/{cliente_id}/enderecos", response_model=List[EnderecoResponse])
def listar_enderecos(
    cliente_id: int,
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    _buscar_cliente_ou_404(db, cliente_id)
    query = db.query(ClienteEndereco).filter(ClienteEndereco.cliente_id == cliente_id)
    if not incluir_inativos:
        query = query.filter(ClienteEndereco.ativo == True)
    return sorted(query.all(), key=lambda e: (e.tipo != "principal", e.id))


@router.post("/{cliente_id}/enderecos", response_model=EnderecoResponse)
def criar_endereco(cliente_id: int, dados: EnderecoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    _buscar_cliente_ou_404(db, cliente_id)

    if dados.tipo == "principal":
        # Só existe um principal ativo: o anterior passa a ser endereço de entrega
        atual = _principal_ativo(db, cliente_id)
        if atual:
            atual.tipo = "entrega"
    elif not _principal_ativo(db, cliente_id):
        raise HTTPException(status_code=400, detail="Cadastre primeiro o endereço principal deste cliente")

    endereco = ClienteEndereco(cliente_id=cliente_id, **dados.model_dump())
    db.add(endereco)
    db.commit()
    db.refresh(endereco)
    return endereco


@router.put("/{cliente_id}/enderecos/{endereco_id}", response_model=EnderecoResponse)
def atualizar_endereco(
    cliente_id: int,
    endereco_id: int,
    dados: EnderecoUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    _buscar_cliente_ou_404(db, cliente_id)
    endereco = _buscar_endereco_ou_404(db, cliente_id, endereco_id)

    atualizacoes = dados.model_dump(exclude_none=True)

    tipo_final = atualizacoes.get("tipo", endereco.tipo)
    ativo_final = atualizacoes.get("ativo", endereco.ativo)
    e_principal_ativo_hoje = endereco.tipo == "principal" and endereco.ativo

    # O cliente nunca pode ficar sem endereço principal ativo
    if e_principal_ativo_hoje and (tipo_final != "principal" or not ativo_final):
        raise HTTPException(
            status_code=400,
            detail="Este é o endereço principal do cliente. Defina outro endereço como principal antes de rebaixá-lo ou desativá-lo."
        )

    if tipo_final == "principal" and not ativo_final:
        raise HTTPException(status_code=400, detail="Um endereço inativo não pode ser o endereço principal")

    # Promoção: o principal atual passa a ser endereço de entrega
    if tipo_final == "principal" and not e_principal_ativo_hoje:
        atual = _principal_ativo(db, cliente_id, ignorar_id=endereco_id)
        if atual:
            atual.tipo = "entrega"

    for campo, valor in atualizacoes.items():
        setattr(endereco, campo, valor)

    db.commit()
    db.refresh(endereco)
    return endereco


@router.delete("/{cliente_id}/enderecos/{endereco_id}")
def desativar_endereco(cliente_id: int, endereco_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    _buscar_cliente_ou_404(db, cliente_id)
    endereco = _buscar_endereco_ou_404(db, cliente_id, endereco_id)

    if endereco.tipo == "principal" and endereco.ativo:
        raise HTTPException(
            status_code=400,
            detail="Este é o endereço principal do cliente. Defina outro endereço como principal antes de desativá-lo."
        )

    endereco.ativo = False
    db.commit()
    return {"message": "Endereço desativado com sucesso"}