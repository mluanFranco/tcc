from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Produto, Categoria, Subcategoria, UnidadeMedida
from schemas.produto import ProdutoCreate, ProdutoUpdate, ProdutoResponse
from core.security import get_current_user
from typing import List

router = APIRouter(prefix="/produtos", tags=["Produtos"])


def _validar_referencias(
    db: Session,
    categoria_id: int,
    subcategoria_id: int,
    unidade_medida_id: int,
    exigir_categoria_ativa: bool = True,
    exigir_subcategoria_ativa: bool = True,
    exigir_unidade_ativa: bool = True
):
    # Existência e hierarquia (subcategoria pertence à categoria) são sempre checadas.
    # A checagem de "ativo" só vale para o que está sendo escolhido agora.
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    if exigir_categoria_ativa and not categoria.ativo:
        raise HTTPException(status_code=400, detail="A categoria selecionada está inativa")

    subcategoria = db.query(Subcategoria).filter(Subcategoria.id == subcategoria_id).first()
    if not subcategoria:
        raise HTTPException(status_code=404, detail="Subcategoria não encontrada")
    if subcategoria.categoria_id != categoria_id:
        raise HTTPException(status_code=400, detail="A subcategoria informada não pertence à categoria selecionada")
    if exigir_subcategoria_ativa and not subcategoria.ativo:
        raise HTTPException(status_code=400, detail="A subcategoria selecionada está inativa")

    unidade = db.query(UnidadeMedida).filter(UnidadeMedida.id == unidade_medida_id).first()
    if not unidade:
        raise HTTPException(status_code=404, detail="Unidade de medida não encontrada")
    if exigir_unidade_ativa and not unidade.ativo:
        raise HTTPException(status_code=400, detail="A unidade de medida selecionada está inativa")


def _calcular_preco_venda(preco_custo: float, porcentagem: float) -> float:
    return round(preco_custo + (preco_custo * porcentagem / 100), 2)


@router.post("/", response_model=ProdutoResponse)
def criar_produto(dados: ProdutoCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Na criação, tudo precisa estar ativo
    _validar_referencias(db, dados.categoria_id, dados.subcategoria_id, dados.unidade_medida_id)

    payload = dados.model_dump()

    if payload["e_vendavel"]:
        payload["preco_venda"] = _calcular_preco_venda(payload["preco_custo"], payload["porcentagem"])
    else:
        # zera dados de venda em produtos que não são vendáveis, mesmo que tenham vindo no payload
        payload["porcentagem"] = None
        payload["preco_venda"] = None

    produto = Produto(**payload)
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return produto


@router.get("/", response_model=List[ProdutoResponse])
def listar_produtos(
    incluir_inativos: bool = False,
    e_insumo: bool = None,
    e_vendavel: bool = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = db.query(Produto)
    if not incluir_inativos:
        query = query.filter(Produto.ativo == True)
    if e_insumo is not None:
        query = query.filter(Produto.e_insumo == e_insumo)
    if e_vendavel is not None:
        query = query.filter(Produto.e_vendavel == e_vendavel)
    return query.all()


@router.get("/inativos", response_model=List[ProdutoResponse])
def listar_produtos_inativos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Produto).filter(Produto.ativo == False).all()


@router.get("/estoque-baixo", response_model=List[ProdutoResponse])
def produtos_estoque_baixo(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Produto).filter(
        Produto.ativo == True,
        Produto.estoque_atual <= Produto.estoque_minimo
    ).all()


@router.get("/{produto_id}", response_model=ProdutoResponse)
def buscar_produto(produto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return produto


@router.put("/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(produto_id: int, dados: ProdutoUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    atualizacoes = dados.model_dump(exclude_none=True)

    # estado final resultante da mesclagem (banco + payload), para validar as regras cruzadas
    categoria_final = atualizacoes.get("categoria_id", produto.categoria_id)
    subcategoria_final = atualizacoes.get("subcategoria_id", produto.subcategoria_id)
    unidade_final = atualizacoes.get("unidade_medida_id", produto.unidade_medida_id)
    e_insumo_final = atualizacoes.get("e_insumo", produto.e_insumo)
    e_vendavel_final = atualizacoes.get("e_vendavel", produto.e_vendavel)
    preco_custo_final = atualizacoes.get("preco_custo", produto.preco_custo)
    porcentagem_final = atualizacoes.get("porcentagem", produto.porcentagem)

    if not e_insumo_final and not e_vendavel_final:
        raise HTTPException(
            status_code=400,
            detail="O produto precisa ser ao menos um dos dois: insumo (e_insumo) ou vendável (e_vendavel)."
        )

    categoria_mudou = categoria_final != produto.categoria_id
    subcategoria_mudou = subcategoria_final != produto.subcategoria_id
    unidade_mudou = unidade_final != produto.unidade_medida_id

    if categoria_mudou or subcategoria_mudou or unidade_mudou:
        # "Ativo" só é exigido para o que está sendo trocado agora; referências
        # antigas inativas não impedem a edição de outros campos do produto.
        _validar_referencias(
            db, categoria_final, subcategoria_final, unidade_final,
            exigir_categoria_ativa=categoria_mudou,
            exigir_subcategoria_ativa=subcategoria_mudou,
            exigir_unidade_ativa=unidade_mudou
        )

    if e_vendavel_final:
        if porcentagem_final is None:
            raise HTTPException(
                status_code=400,
                detail="Produtos vendáveis (e_vendavel=True) precisam de 'porcentagem' definida."
            )
        atualizacoes["preco_venda"] = _calcular_preco_venda(preco_custo_final, porcentagem_final)
        atualizacoes["porcentagem"] = porcentagem_final
    else:
        # deixou de ser vendável (ou já não era): zera os campos de venda
        atualizacoes["porcentagem"] = None
        atualizacoes["preco_venda"] = None

    for campo, valor in atualizacoes.items():
        setattr(produto, campo, valor)

    db.commit()
    db.refresh(produto)
    return produto


@router.delete("/{produto_id}")
def desativar_produto(produto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    produto = db.query(Produto).filter(Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    produto.ativo = False
    db.commit()
    return {"message": f"Produto {produto.nome} desativado com sucesso"}