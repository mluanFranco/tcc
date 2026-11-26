from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core import pdf
from core.relatorios import resolver_periodo
from core.permissoes import exigir, exigir_tipo_cotacao
from models import Cotacao
from core.security import get_current_user
from database import get_db

router = APIRouter(tags=["PDF"])


def _resposta(conteudo: bytes, nome_arquivo: str) -> Response:
    """PDF para abrir no navegador (inline), com nome de arquivo sugerido para o download."""
    return Response(
        content=conteudo, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'},
    )


@router.get("/cotacoes/{cotacao_id}/pdf", dependencies=[Depends(exigir("cotacoes.ver"))], response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_da_cotacao(cotacao_id: int, request: Request, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Cotação em PDF (venda ou compra): partes, itens, total e condição de pagamento. Não altera nada."""
    cotacao = db.get(Cotacao, cotacao_id)
    if cotacao is None:
        raise HTTPException(status_code=404, detail="Cotação não encontrada")
    exigir_tipo_cotacao(request, db, usuario, cotacao.tipo)   # tipo sem acesso: 404
    return _resposta(*pdf.pdf_cotacao(db, cotacao_id, usuario.nome))


@router.get("/pedidos-venda/{pedido_id}/pdf", dependencies=[Depends(exigir("vendas.ver"))], response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_do_pedido_venda(pedido_id: int, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Pedido de venda em PDF. Pedido cancelado sai com a faixa CANCELADO. Não altera nada."""
    return _resposta(*pdf.pdf_pedido_venda(db, pedido_id, usuario.nome))


@router.get("/pedidos-compra/{pedido_id}/pdf", dependencies=[Depends(exigir("compras.ver"))], response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_do_pedido_compra(pedido_id: int, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Pedido de compra em PDF, com o que já foi recebido por item. Pedido cancelado sai com a faixa CANCELADO. Não altera nada."""
    return _resposta(*pdf.pdf_pedido_compra(db, pedido_id, usuario.nome))


@router.get("/geladeiras/relatorio/pdf", dependencies=[Depends(exigir("geladeiras.ver"))], response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_relatorio_geladeiras(
    status: Optional[str] = Query(default=None, pattern="^(em_campo|manutencao|desativada)$", description="Só uma situação. Sem ele: todas."),
    data_inicio: Optional[date] = Query(default=None, description="Início do período das manutenções. Padrão: 1º de janeiro do ano corrente."),
    data_fim: Optional[date] = Query(default=None, description="Fim do período das manutenções. Padrão: hoje."),
    db: Session = Depends(get_db), usuario=Depends(get_current_user),
):
    """
    Relatório de patrimônio das geladeiras (posição atual): cliente, endereço de instalação, situação, valor de
    aquisição e gasto com manutenção no período, com resumo por situação. Base para a declaração de bens. Não altera nada.
    """
    inicio, fim = resolver_periodo(data_inicio, data_fim)
    return _resposta(*pdf.pdf_relatorio_geladeiras(db, usuario.nome, status=status, inicio=inicio, fim=fim))
