"""
Exportação das listagens em PDF e Excel.

- POST /exportacao/{modulo}?formato=pdf|xlsx  -> a tela manda os ids das linhas visíveis (na ordem da tela) e a
  descrição dos filtros; produtos, clientes e fornecedores exigem cadastros.editar (dados pessoais em massa, LGPD);
  os demais, o ".ver" do módulo. É um POST só porque a lista de ids pode ser grande: nada é alterado.
- GET /exportacao/financeiro (só Excel) -> mesmos filtros da listagem de títulos (financeiro.ver).
- GET /geladeiras/relatorio/xlsx -> Excel do relatório de patrimônio (mesmos filtros do PDF; geladeiras.ver).
"""
from datetime import date
from types import SimpleNamespace
from typing import List, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from core import exportacao_modulos as M
from core.exportacao import gerar_pdf, gerar_xlsx
from core.permissoes import checar_permissao, exigir
from core.relatorios import resolver_periodo
from core.security import get_current_user
from database import get_db
from models import CategoriaFinanceira, TituloFinanceiro
from routes.financeiro import _aplicar_filtros, filtros_titulos

router = APIRouter(tags=["Exportação"])

TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
Modulo = Literal["produtos", "clientes", "fornecedores", "pedidos-venda", "pedidos-compra", "cotacoes", "producao"]


class ExportacaoRequest(BaseModel):
    ids: List[int] = Field(min_length=1, max_length=10_000, description="Ids das linhas visíveis, na ordem da tela")
    filtros: List[Tuple[str, str]] = Field(default_factory=list, max_length=12, description="Pares rótulo/valor dos filtros aplicados")
    aba: Optional[Literal["ordens", "receitas"]] = Field(default=None, description="Só em produção: qual lista exportar")


def _arquivo(conteudo: bytes, nome: str, formato: str) -> Response:
    if formato == "pdf":
        return Response(content=conteudo, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{nome}"'})
    return Response(content=conteudo, media_type=TIPO_XLSX, headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@router.post("/exportacao/{modulo}", response_class=Response,
             responses={200: {"content": {"application/pdf": {}, TIPO_XLSX: {}}}})
def exportar_listagem(
    modulo: Modulo,
    dados: ExportacaoRequest,
    request: Request,
    formato: Literal["pdf", "xlsx"] = Query(description="pdf ou xlsx (Excel)"),
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Exporta as linhas que a tela está mostrando (com os filtros aplicados) em PDF ou Excel. Não altera nada."""
    funcao, permissao = M.MODULOS[modulo]
    checar_permissao(request, db, usuario, permissao)
    relatorio = funcao(db, dados.ids, dados.filtros, dados.aba)
    conteudo, nome = (gerar_pdf if formato == "pdf" else gerar_xlsx)(relatorio, usuario.nome)
    return _arquivo(conteudo, nome, formato)


def _descrever_filtros_financeiro(db: Session, f: SimpleNamespace) -> List[Tuple[str, str]]:
    br = lambda d: d.strftime("%d/%m/%Y")  # noqa: E731
    pares = [("Tipo", {"receber": "A receber", "pagar": "A pagar"}.get(f.tipo, "Todos"))]
    if f.vencido:
        pares.append(("Situação", "Vencidos"))
    elif f.status:
        pares.append(("Situação", {"pendente": "Pendentes", "aberto": "Em aberto", "parcial": "Parciais",
                                   "pago": "Pagos", "cancelado": "Cancelados"}.get(f.status, f.status)))
    if f.vencimento_de or f.vencimento_ate:
        pares.append(("Vencimento", f"{br(f.vencimento_de) if f.vencimento_de else '...'} a {br(f.vencimento_ate) if f.vencimento_ate else '...'}"))
    if f.categoria_id:
        cat = db.get(CategoriaFinanceira, f.categoria_id)
        pares.append(("Categoria", cat.nome if cat else f"#{f.categoria_id}"))
    if f.avulso is not None:
        pares.append(("Origem", "Lançamentos avulsos" if f.avulso else "Pedidos e manutenções"))
    if f.busca:
        pares.append(("Busca", f.busca))
    return pares


@router.get("/exportacao/financeiro", response_class=Response, responses={200: {"content": {TIPO_XLSX: {}}}},
            dependencies=[Depends(exigir("financeiro.ver"))])
def exportar_financeiro(
    filtros: SimpleNamespace = Depends(filtros_titulos),
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Títulos do filtro (mesmos parâmetros de GET /financeiro/titulos, sem paginação) e as baixas deles, em Excel."""
    consulta = db.query(TituloFinanceiro).options(
        joinedload(TituloFinanceiro.cliente), joinedload(TituloFinanceiro.fornecedor),
        joinedload(TituloFinanceiro.categoria), joinedload(TituloFinanceiro.baixas))
    titulos = _aplicar_filtros(db, consulta, filtros).order_by(TituloFinanceiro.vencimento, TituloFinanceiro.id).all()
    relatorio = M.financeiro(titulos, _descrever_filtros_financeiro(db, filtros))
    conteudo, nome = gerar_xlsx(relatorio, usuario.nome)
    return _arquivo(conteudo, nome, "xlsx")


@router.get("/geladeiras/relatorio/xlsx", response_class=Response, responses={200: {"content": {TIPO_XLSX: {}}}},
            dependencies=[Depends(exigir("geladeiras.ver"))])
def exportar_geladeiras(
    status: Optional[str] = Query(default=None, pattern="^(em_campo|manutencao|desativada)$"),
    data_inicio: Optional[date] = Query(default=None, description="Início do período das manutenções. Padrão: 1º de janeiro."),
    data_fim: Optional[date] = Query(default=None, description="Fim do período das manutenções. Padrão: hoje."),
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Relatório de patrimônio das geladeiras em Excel: uma aba com as geladeiras e outra com as manutenções do período."""
    inicio, fim = resolver_periodo(data_inicio, data_fim)
    conteudo, nome = gerar_xlsx(M.geladeiras(db, status=status, inicio=inicio, fim=fim), usuario.nome)
    return _arquivo(conteudo, nome, "xlsx")
