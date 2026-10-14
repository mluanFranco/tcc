from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core import pdf
from core.security import get_current_user
from database import get_db

router = APIRouter(tags=["PDF"])


def _resposta(conteudo: bytes, nome_arquivo: str) -> Response:
    """PDF para abrir no navegador (inline), com nome de arquivo sugerido para o download."""
    return Response(
        content=conteudo, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'},
    )


@router.get("/cotacoes/{cotacao_id}/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_da_cotacao(cotacao_id: int, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Cotação em PDF (venda ou compra): partes, itens, total e condição de pagamento. Não altera nada."""
    return _resposta(*pdf.pdf_cotacao(db, cotacao_id, usuario.nome))


@router.get("/pedidos-venda/{pedido_id}/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_do_pedido_venda(pedido_id: int, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Pedido de venda em PDF. Pedido cancelado sai com a faixa CANCELADO. Não altera nada."""
    return _resposta(*pdf.pdf_pedido_venda(db, pedido_id, usuario.nome))


@router.get("/pedidos-compra/{pedido_id}/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def pdf_do_pedido_compra(pedido_id: int, db: Session = Depends(get_db), usuario=Depends(get_current_user)):
    """Pedido de compra em PDF, com o que já foi recebido por item. Pedido cancelado sai com a faixa CANCELADO. Não altera nada."""
    return _resposta(*pdf.pdf_pedido_compra(db, pedido_id, usuario.nome))
