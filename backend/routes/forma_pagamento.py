from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models import FormaPagamento, FormaPagamentoParcela
from schemas.forma_pagamento import (
    FormaPagamentoCreate, FormaPagamentoUpdate, FormaPagamentoResponse,
    SimulacaoPagamentoResponse, ParcelaSimulada,
)
from core.security import get_current_user
from core.pagamento import gerar_parcelas, classificar_forma
from typing import List, Optional
from datetime import date
from decimal import Decimal

router = APIRouter(prefix="/formas-pagamento", tags=["Formas de Pagamento"])


# ---------- auxiliares ----------

def _buscar_ou_404(db: Session, forma_id: int) -> FormaPagamento:
    forma = db.query(FormaPagamento).filter(FormaPagamento.id == forma_id).first()
    if not forma:
        raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada")
    return forma


def _garantir_descricao_livre(db: Session, descricao: str, ignorar_id: Optional[int] = None) -> None:
    query = db.query(FormaPagamento).filter(func.lower(FormaPagamento.descricao) == descricao.lower())
    if ignorar_id is not None:
        query = query.filter(FormaPagamento.id != ignorar_id)
    if query.first():
        raise HTTPException(status_code=400, detail=f"Já existe uma forma de pagamento com a descrição '{descricao}'")


# ---------- rotas ----------

@router.post("/", response_model=FormaPagamentoResponse)
def criar_forma_pagamento(dados: FormaPagamentoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    _garantir_descricao_livre(db, dados.descricao)

    forma = FormaPagamento(
        descricao=dados.descricao,
        taxa_percentual=dados.taxa_percentual,
        ativo=True,
        parcelas=[
            FormaPagamentoParcela(numero=i, prazo_dias=p.prazo_dias, percentual=p.percentual)
            for i, p in enumerate(dados.parcelas, start=1)
        ],
    )
    db.add(forma)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()   # duas requisições simultâneas com a mesma descrição: a UNIQUE do banco barra a segunda
        raise HTTPException(status_code=400, detail=f"Já existe uma forma de pagamento com a descrição '{dados.descricao}'")
    db.refresh(forma)
    return forma


@router.get("/", response_model=List[FormaPagamentoResponse])
def listar_formas_pagamento(
    incluir_inativos: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(FormaPagamento)
    if not incluir_inativos:
        query = query.filter(FormaPagamento.ativo == True)
    return query.order_by(FormaPagamento.descricao).all()


@router.get("/inativos", response_model=List[FormaPagamentoResponse])
def listar_formas_pagamento_inativas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(FormaPagamento).filter(FormaPagamento.ativo == False).order_by(FormaPagamento.descricao).all()


@router.get("/{forma_id}", response_model=FormaPagamentoResponse)
def buscar_forma_pagamento(forma_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _buscar_ou_404(db, forma_id)


@router.get("/{forma_id}/simulacao", response_model=SimulacaoPagamentoResponse)
def simular_pagamento(
    forma_id: int,
    valor: Decimal = Query(gt=0, max_digits=12, decimal_places=2),
    data_base: Optional[date] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Somente leitura: mostra como `valor` seria dividido nas parcelas desta forma, com vencimentos."""
    forma = _buscar_ou_404(db, forma_id)
    base = data_base or date.today()
    return SimulacaoPagamentoResponse(
        forma_pagamento_id=forma.id,
        descricao=forma.descricao,
        tipo=classificar_forma(forma.parcelas),
        valor_total=valor,
        data_base=base,
        parcelas=[ParcelaSimulada(**p) for p in gerar_parcelas(forma.parcelas, valor, base)],
    )


@router.put("/{forma_id}", response_model=FormaPagamentoResponse)
def atualizar_forma_pagamento(
    forma_id: int,
    dados: FormaPagamentoUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    forma = _buscar_ou_404(db, forma_id)

    if dados.descricao is not None:
        _garantir_descricao_livre(db, dados.descricao, ignorar_id=forma.id)
        forma.descricao = dados.descricao
    if dados.taxa_percentual is not None:
        forma.taxa_percentual = dados.taxa_percentual

    if dados.parcelas is not None:
        # Atualiza por número: mantém as linhas que continuam, cria as novas e remove as que sobraram
        atuais = {p.numero: p for p in forma.parcelas}
        for i, nova in enumerate(dados.parcelas, start=1):
            if i in atuais:
                atuais[i].prazo_dias = nova.prazo_dias
                atuais[i].percentual = nova.percentual
            else:
                forma.parcelas.append(FormaPagamentoParcela(numero=i, prazo_dias=nova.prazo_dias, percentual=nova.percentual))
        for numero, parcela in atuais.items():
            if numero > len(dados.parcelas):
                forma.parcelas.remove(parcela)   # delete-orphan apaga a linha

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Já existe uma forma de pagamento com essa descrição")
    db.refresh(forma)
    return forma


@router.delete("/{forma_id}")
def desativar_forma_pagamento(forma_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = _buscar_ou_404(db, forma_id)
    forma.ativo = False
    db.commit()
    return {"message": f"Forma de pagamento '{forma.descricao}' desativada com sucesso"}


@router.patch("/{forma_id}/reativar", response_model=FormaPagamentoResponse)
def reativar_forma_pagamento(forma_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    forma = _buscar_ou_404(db, forma_id)
    forma.ativo = True
    db.commit()
    db.refresh(forma)
    return forma
