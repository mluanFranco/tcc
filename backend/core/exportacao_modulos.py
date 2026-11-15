"""
O que cada módulo exporta: busca os registros (na ordem em que a tela mostra) e define as colunas.

As listagens filtram no navegador (abas, busca, categoria, período), então a tela manda os IDS das linhas visíveis e a
descrição dos filtros; assim o arquivo sai exatamente igual ao que o usuário vê. O financeiro (paginado no servidor)
usa os mesmos filtros da listagem. Geladeiras usam os filtros do relatório de patrimônio.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session, joinedload

from core.estoque import quantidade_base
from core.exportacao import Coluna as C, Planilha, Relatorio, checar_tamanho
from core.pdf import cep_br, documento_br, qtd
from models import (
    BaixaTitulo, Cliente, Cotacao, Fornecedor, Geladeira, HistoricoManutencao, ItemCotacao, ItemPedidoCompra,
    ItemPedidoVenda, OrdemProducao, PedidoCompra, PedidoVenda, Produto, Receita, TituloFinanceiro, Usuario,
)

ST_VENDA = {"aberto": "Aberto", "confirmado": "Confirmado", "cancelado": "Cancelado"}
ST_COMPRA = {"pendente": "Pendente", "recebido": "Recebido", "cancelado": "Cancelado"}
ST_COTACAO = {"rascunho": "Rascunho", "enviada": "Enviada", "recebida": "Recebida", "aprovada": "Aprovada", "recusada": "Recusada"}
ST_ORDEM = {"aberta": "Aberta", "confirmada": "Confirmada", "cancelada": "Cancelada"}
ST_TITULO = {"aberto": "Em aberto", "parcial": "Parcial", "pago": "Pago", "cancelado": "Cancelado"}
ST_GELADEIRA = {"em_campo": "Em campo", "manutencao": "Em manutenção", "desativada": "Desativada"}


# ---------------------------------------------------------------- formatação comum

def telefone_br(v) -> Optional[str]:
    d = "".join(ch for ch in str(v or "") if ch.isdigit())
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return v or None


def endereco_texto(e) -> Optional[str]:
    """Endereço em uma linha (texto puro; o PDF escapa na hora de desenhar)."""
    if not e:
        return None
    partes = [", ".join(x for x in (e.logradouro, e.numero) if x), e.complemento, e.bairro,
              "/".join(x for x in (e.cidade, e.uf) if x), f"CEP {cep_br(e.cep)}" if e.cep else None]
    return " - ".join(x for x in partes if x) or None


def cidade_uf(e) -> Optional[str]:
    return "/".join(x for x in (getattr(e, "cidade", None), getattr(e, "uf", None)) if x) or None


def endereco_principal(cliente):
    ativos = [e for e in cliente.enderecos if e.ativo]
    return next((e for e in ativos if e.tipo == "principal"), ativos[0] if ativos else None)


def unidade_negociada(produto, fator) -> Optional[str]:
    """'Pote (5 L)' quando o item foi negociado em embalagem; senão a sigla base."""
    base = produto.unidade_medida.sigla if produto.unidade_medida else None
    f = Decimal(str(fator or 1))
    if f != 1:
        emb = produto.embalagem_unidade.sigla if produto.embalagem_unidade else "emb."
        return f"{emb} ({qtd(f)} {base or ''})".replace(" )", ")")
    return base


def _por_ids(consulta, modelo, ids: List[int]) -> list:
    """Busca pelos ids e devolve na ORDEM recebida (a ordem da tela); ids inexistentes são ignorados."""
    checar_tamanho(len(ids))
    achados = {o.id: o for o in consulta.filter(modelo.id.in_(ids)).all()}
    lista = [achados[i] for i in dict.fromkeys(ids) if i in achados]   # sem repetidos
    checar_tamanho(len(lista))
    return lista


def _nomes_usuarios(db: Session) -> Dict[int, str]:
    return dict(db.query(Usuario.id, Usuario.nome).all())


# ---------------------------------------------------------------- produtos

def _situacao_estoque(p) -> str:
    disponivel = Decimal(p.estoque_atual or 0) - Decimal(p.estoque_reservado or 0)
    if disponivel <= 0:
        return "Sem estoque"
    if Decimal(p.estoque_atual or 0) <= Decimal(p.estoque_minimo or 0):
        return "Baixo"
    return "Em dia"


def _tipo_produto(p) -> str:
    if p.e_insumo and p.e_vendavel:
        return "Insumo e vendável"
    return "Insumo" if p.e_insumo else ("Vendável" if p.e_vendavel else "—")


def produtos(db: Session, ids, filtros, aba=None) -> Relatorio:
    lista = _por_ids(db.query(Produto).options(
        joinedload(Produto.categoria), joinedload(Produto.subcategoria),
        joinedload(Produto.unidade_medida), joinedload(Produto.embalagem_unidade)), Produto, ids)
    colunas = [
        C("Código", lambda p: p.id, "inteiro", 0.6, pdf=False),
        C("Produto", lambda p: p.nome, peso=2.8),
        C("Categoria", lambda p: p.categoria.nome, peso=1.6),
        C("Subcategoria", lambda p: p.subcategoria.nome, pdf=False),
        C("Tipo", _tipo_produto, peso=1.4),
        C("Unidade base", lambda p: p.unidade_medida.sigla, peso=1.05),
        C("Embalagem", lambda p: unidade_negociada(p, p.fator_embalagem) if Decimal(str(p.fator_embalagem or 1)) != 1 else None, peso=1.2),
        C("Preço de custo", lambda p: p.preco_custo, "dinheiro", 1.2),
        C("% de lucro", lambda p: p.porcentagem, "pct", pdf=False),
        C("Preço de venda", lambda p: p.preco_venda, "dinheiro", 1.2),
        C("Estoque atual", lambda p: p.estoque_atual, "qtd", pdf=False),
        C("Reservado", lambda p: p.estoque_reservado, "qtd", pdf=False),
        C("Disponível", lambda p: Decimal(p.estoque_atual or 0) - Decimal(p.estoque_reservado or 0), "qtd", 1.15),
        C("Estoque mínimo", lambda p: p.estoque_minimo, "qtd", 1),
        C("Situação do estoque", _situacao_estoque, peso=1.1),
        C("Valor em estoque (custo)", lambda p: Decimal(p.estoque_atual or 0) * Decimal(str(p.custo_unidade_base)), "dinheiro", 1.3, total=True),
        C("Cadastro", lambda p: "Ativo" if p.ativo else "Inativo", pdf=False),
    ]
    return Relatorio("Relatório de produtos", "produtos", filtros, Planilha("Produtos", colunas, lista))


# ---------------------------------------------------------------- clientes e fornecedores

def clientes(db: Session, ids, filtros, aba=None) -> Relatorio:
    lista = _por_ids(db.query(Cliente).options(joinedload(Cliente.enderecos)), Cliente, ids)
    colunas = [
        C("Código", lambda c: c.id, "inteiro", 0.6, pdf=False),
        C("Nome", lambda c: c.nome, peso=2.6),
        C("Razão social", lambda c: c.razao_social, peso=2.6),
        C("Tipo", lambda c: c.tipo, peso=0.6),
        C("CPF/CNPJ", lambda c: documento_br(c.cpf_cnpj), peso=1.8),
        C("Telefone", lambda c: telefone_br(c.telefone), peso=1.4),
        C("E-mail", lambda c: c.email, peso=2.2),
        C("Cidade/UF", lambda c: cidade_uf(endereco_principal(c)), peso=1.6),
        C("Endereço principal", lambda c: endereco_texto(endereco_principal(c)), pdf=False),
        C("Endereços ativos", lambda c: sum(1 for e in c.enderecos if e.ativo), "inteiro", pdf=False),
        C("Cadastro", lambda c: "Ativo" if c.ativo else "Inativo", peso=0.8),
    ]
    return Relatorio("Relatório de clientes", "clientes", filtros, Planilha("Clientes", colunas, lista))


def fornecedores(db: Session, ids, filtros, aba=None) -> Relatorio:
    lista = _por_ids(db.query(Fornecedor), Fornecedor, ids)
    colunas = [
        C("Código", lambda f: f.id, "inteiro", 0.6, pdf=False),
        C("Nome", lambda f: f.nome, peso=2.6),
        C("Razão social", lambda f: f.razao_social, peso=2.8),
        C("CNPJ", lambda f: documento_br(f.cnpj), peso=1.8),
        C("Telefone", lambda f: telefone_br(f.telefone), peso=1.4),
        C("E-mail", lambda f: f.email, peso=2.2),
        C("Cidade/UF", lambda f: cidade_uf(f), peso=1.6),
        C("Endereço", lambda f: endereco_texto(f), pdf=False),
        C("Cadastro", lambda f: "Ativo" if f.ativo else "Inativo", peso=0.8),
    ]
    return Relatorio("Relatório de fornecedores", "fornecedores", filtros, Planilha("Fornecedores", colunas, lista))


# ---------------------------------------------------------------- pedidos de venda

def pedidos_venda(db: Session, ids, filtros, aba=None) -> Relatorio:
    lista = _por_ids(db.query(PedidoVenda).options(
        joinedload(PedidoVenda.cliente), joinedload(PedidoVenda.forma_pagamento), joinedload(PedidoVenda.endereco_entrega),
        joinedload(PedidoVenda.itens).joinedload(ItemPedidoVenda.produto)), PedidoVenda, ids)
    usuarios = _nomes_usuarios(db)
    colunas = [
        C("Nº", lambda p: p.id, "inteiro", 0.6),
        C("Data do pedido", lambda p: p.data_pedido, "data", 1.1),
        C("Cliente", lambda p: p.cliente.nome, peso=3),
        C("CPF/CNPJ", lambda p: documento_br(p.cliente.cpf_cnpj), pdf=False),
        C("Situação", lambda p: ST_VENDA.get(p.status, p.status), peso=1),
        C("Confirmado em", lambda p: p.confirmado_em, "data", 1.1),
        C("Forma de pagamento", lambda p: p.forma_pagamento.descricao if p.forma_pagamento else None, peso=2),
        C("Entrega", lambda p: endereco_texto(p.endereco_entrega) or "Retirada", pdf=False),
        C("Itens", lambda p: len(p.itens), "inteiro", 0.6),
        C("Descontos", lambda p: sum(Decimal(str(i.desconto or 0)) for i in p.itens), "dinheiro", pdf=False),
        C("Total", lambda p: p.valor_total, "dinheiro", 1.2, total=True),
        C("Lançado por", lambda p: usuarios.get(p.usuario_id), pdf=False),
        C("Observação", lambda p: p.observacao, pdf=False),
    ]
    itens = [(p, i) for p in lista for i in sorted(p.itens, key=lambda x: x.id)]
    colunas_itens = [
        C("Nº do pedido", lambda t: t[0].id, "inteiro"),
        C("Data do pedido", lambda t: t[0].data_pedido, "data"),
        C("Cliente", lambda t: t[0].cliente.nome),
        C("Situação", lambda t: ST_VENDA.get(t[0].status, t[0].status)),
        C("Produto", lambda t: t[1].produto.nome),
        C("Unidade", lambda t: unidade_negociada(t[1].produto, t[1].fator)),
        C("Quantidade", lambda t: t[1].quantidade, "qtd"),
        C("Quantidade (unid. base)", lambda t: quantidade_base(t[1].quantidade, t[1].fator), "qtd"),
        C("Preço unitário", lambda t: t[1].preco_unitario, "dinheiro"),
        C("Desconto", lambda t: t[1].desconto, "dinheiro"),
        C("Subtotal", lambda t: t[1].subtotal, "dinheiro", total=True),
    ]
    return Relatorio("Relatório de pedidos de venda", "pedidos-venda", filtros,
                     Planilha("Pedidos de venda", colunas, lista), [Planilha("Itens", colunas_itens, itens)])


# ---------------------------------------------------------------- pedidos de compra

def _recebido_pct(p) -> Optional[Decimal]:
    pedido = sum((Decimal(i.quantidade or 0) for i in p.itens), Decimal("0"))
    recebido = sum((Decimal(i.quantidade_recebida or 0) for i in p.itens), Decimal("0"))
    return (recebido / pedido * 100) if pedido else None


def pedidos_compra(db: Session, ids, filtros, aba=None) -> Relatorio:
    lista = _por_ids(db.query(PedidoCompra).options(
        joinedload(PedidoCompra.fornecedor), joinedload(PedidoCompra.forma_pagamento),
        joinedload(PedidoCompra.itens).joinedload(ItemPedidoCompra.produto)), PedidoCompra, ids)
    usuarios = _nomes_usuarios(db)
    colunas = [
        C("Nº", lambda p: p.id, "inteiro", 0.6),
        C("Data do pedido", lambda p: p.data_pedido, "data", 1.1),
        C("Fornecedor", lambda p: p.fornecedor.nome, peso=3),
        C("CNPJ", lambda p: documento_br(p.fornecedor.cnpj), pdf=False),
        C("Situação", lambda p: ST_COMPRA.get(p.status, p.status), peso=1),
        C("Entrega prevista", lambda p: p.data_entrega_prevista, "data", 1.1),
        C("Forma de pagamento", lambda p: p.forma_pagamento.descricao if p.forma_pagamento else None, peso=2),
        C("Itens", lambda p: len(p.itens), "inteiro", 0.6),
        C("Recebido", _recebido_pct, "pct", 0.9),
        C("Total", lambda p: p.valor_total, "dinheiro", 1.2, total=True),
        C("Lançado por", lambda p: usuarios.get(p.usuario_id), pdf=False),
        C("Observação", lambda p: p.observacao, pdf=False),
    ]
    itens = [(p, i) for p in lista for i in sorted(p.itens, key=lambda x: x.id)]
    colunas_itens = [
        C("Nº do pedido", lambda t: t[0].id, "inteiro"),
        C("Data do pedido", lambda t: t[0].data_pedido, "data"),
        C("Fornecedor", lambda t: t[0].fornecedor.nome),
        C("Situação", lambda t: ST_COMPRA.get(t[0].status, t[0].status)),
        C("Produto", lambda t: t[1].produto.nome),
        C("Unidade", lambda t: unidade_negociada(t[1].produto, t[1].fator)),
        C("Qtd. pedida", lambda t: t[1].quantidade, "qtd"),
        C("Qtd. recebida", lambda t: t[1].quantidade_recebida, "qtd"),
        C("Preço unitário", lambda t: t[1].preco_unitario, "dinheiro"),
        C("Subtotal", lambda t: t[1].subtotal, "dinheiro", total=True),
    ]
    return Relatorio("Relatório de pedidos de compra", "pedidos-compra", filtros,
                     Planilha("Pedidos de compra", colunas, lista), [Planilha("Itens", colunas_itens, itens)])


# ---------------------------------------------------------------- cotações

def _subtotal_cotacao(i) -> Optional[Decimal]:
    if i.preco_unitario is None:
        return None
    return (Decimal(str(i.quantidade)) * Decimal(str(i.preco_unitario)) - Decimal(str(i.desconto or 0))).quantize(Decimal("0.01"))


def _total_cotacao(c) -> Optional[Decimal]:
    subtotais = [_subtotal_cotacao(i) for i in c.itens]
    return None if any(s is None for s in subtotais) else sum(subtotais, Decimal("0"))


def _parte(c) -> Optional[str]:
    return (c.cliente.nome if c.cliente else None) if c.tipo == "venda" else (c.fornecedor.nome if c.fornecedor else None)


def _pedido_gerado(c) -> Optional[str]:
    if c.pedido_venda_id:
        return f"Venda nº {c.pedido_venda_id}"
    if c.pedido_compra_id:
        return f"Compra nº {c.pedido_compra_id}"
    return None


def cotacoes(db: Session, ids, filtros, aba=None) -> Relatorio:
    from models import FormaPagamento
    lista = _por_ids(db.query(Cotacao).options(
        joinedload(Cotacao.cliente), joinedload(Cotacao.fornecedor),
        joinedload(Cotacao.itens).joinedload(ItemCotacao.produto)), Cotacao, ids)
    formas = dict(db.query(FormaPagamento.id, FormaPagamento.descricao).all())
    colunas = [
        C("Nº", lambda c: c.id, "inteiro", 0.6),
        C("Tipo", lambda c: "Venda" if c.tipo == "venda" else "Compra", peso=0.8),
        C("Data", lambda c: c.data_cotacao, "data", 1),
        C("Validade", lambda c: c.validade, "data", 1),
        C("Cliente / fornecedor", _parte, peso=3),
        C("Situação", lambda c: ST_COTACAO.get(c.status, c.status), peso=1),
        C("Forma de pagamento", lambda c: formas.get(c.forma_pagamento_id), peso=1.8),
        C("Itens", lambda c: len(c.itens), "inteiro", 0.6),
        C("Pedido gerado", _pedido_gerado, peso=1.2),
        C("Total", _total_cotacao, "dinheiro", 1.2, total=True),
        C("Observação", lambda c: c.observacao, pdf=False),
    ]
    itens = [(c, i) for c in lista for i in sorted(c.itens, key=lambda x: x.id)]
    colunas_itens = [
        C("Nº da cotação", lambda t: t[0].id, "inteiro"),
        C("Tipo", lambda t: "Venda" if t[0].tipo == "venda" else "Compra"),
        C("Cliente / fornecedor", lambda t: _parte(t[0])),
        C("Situação", lambda t: ST_COTACAO.get(t[0].status, t[0].status)),
        C("Produto", lambda t: t[1].produto.nome),
        C("Unidade", lambda t: unidade_negociada(t[1].produto, t[1].fator)),
        C("Quantidade", lambda t: t[1].quantidade, "qtd"),
        C("Preço unitário", lambda t: t[1].preco_unitario, "dinheiro"),
        C("Desconto", lambda t: t[1].desconto, "dinheiro"),
        C("Subtotal", lambda t: _subtotal_cotacao(t[1]), "dinheiro", total=True),
        C("Observação do item", lambda t: t[1].observacao),
    ]
    return Relatorio("Relatório de cotações", "cotacoes", filtros,
                     Planilha("Cotações", colunas, lista), [Planilha("Itens", colunas_itens, itens)])


# ---------------------------------------------------------------- produção (ordens ou receitas, conforme a aba)

def _sigla(produto) -> str:
    return produto.unidade_medida.sigla if produto and produto.unidade_medida else ""


def producao(db: Session, ids, filtros, aba=None) -> Relatorio:
    if aba == "receitas":
        return _receitas(db, ids, filtros)
    lista = _por_ids(db.query(OrdemProducao).options(
        joinedload(OrdemProducao.produto).joinedload(Produto.unidade_medida),
        joinedload(OrdemProducao.itens)), OrdemProducao, ids)
    usuarios = _nomes_usuarios(db)
    colunas = [
        C("Nº", lambda o: o.id, "inteiro", 0.6),
        C("Criada em", lambda o: o.created_at, "data", 1),
        C("Produto fabricado", lambda o: o.produto.nome, peso=3),
        C("Quantidade", lambda o: o.quantidade, "qtd", 1),
        C("Unidade", lambda o: _sigla(o.produto), peso=0.7),
        C("Situação", lambda o: ST_ORDEM.get(o.status, o.status), peso=1),
        C("Confirmada em", lambda o: o.confirmada_em, "data", 1.1),
        C("Custo unitário", lambda o: o.custo_unitario, "dinheiro", 1.1),
        C("Custo total", lambda o: o.custo_total, "dinheiro", 1.2, total=True),
        C("Responsável", lambda o: usuarios.get(o.usuario_id), pdf=False),
        C("Observação", lambda o: o.observacao, pdf=False),
    ]
    produtos_ids = {i.produto_id for o in lista for i in o.itens}
    insumos = {p.id: p for p in db.query(Produto).options(joinedload(Produto.unidade_medida)).filter(Produto.id.in_(produtos_ids))} if produtos_ids else {}
    itens = [(o, i) for o in lista for i in sorted(o.itens, key=lambda x: x.id)]
    colunas_itens = [
        C("Nº da ordem", lambda t: t[0].id, "inteiro"),
        C("Produto fabricado", lambda t: t[0].produto.nome),
        C("Situação da ordem", lambda t: ST_ORDEM.get(t[0].status, t[0].status)),
        C("Insumo", lambda t: insumos[t[1].produto_id].nome),
        C("Quantidade", lambda t: t[1].quantidade, "qtd"),
        C("Unidade", lambda t: _sigla(insumos.get(t[1].produto_id))),
        C("Custo unitário", lambda t: t[1].custo_unitario, "dinheiro"),
        C("Subtotal", lambda t: t[1].subtotal, "dinheiro", total=True),
    ]
    return Relatorio("Relatório de ordens de produção", "ordens-producao", filtros,
                     Planilha("Ordens de produção", colunas, lista), [Planilha("Insumos", colunas_itens, itens)])


def _custo_receita(r) -> Decimal:
    return sum((Decimal(str(i.quantidade)) * Decimal(str(i.produto.custo_unidade_base)) for i in r.itens), Decimal("0"))


def _receitas(db: Session, ids, filtros) -> Relatorio:
    from models import ReceitaItem
    lista = _por_ids(db.query(Receita).options(
        joinedload(Receita.produto).joinedload(Produto.unidade_medida),
        joinedload(Receita.itens).joinedload(ReceitaItem.produto).joinedload(Produto.unidade_medida)), Receita, ids)
    colunas = [
        C("Produto", lambda r: r.produto.nome, peso=3),
        C("Rendimento", lambda r: r.rendimento, "qtd", 1),
        C("Unidade", lambda r: _sigla(r.produto), peso=0.7),
        C("Insumos", lambda r: len(r.itens), "inteiro", 0.8),
        C("Custo estimado da receita", _custo_receita, "dinheiro", 1.4),
        C("Custo estimado por unidade", lambda r: _custo_receita(r) / Decimal(str(r.rendimento)) if r.rendimento else None, "dinheiro", 1.4),
        C("Situação", lambda r: "Ativa" if r.ativo else "Inativa", peso=0.8),
        C("Observação", lambda r: r.observacao, pdf=False),
    ]
    itens = [(r, i) for r in lista for i in sorted(r.itens, key=lambda x: x.id)]
    colunas_itens = [
        C("Receita (produto)", lambda t: t[0].produto.nome),
        C("Rendimento", lambda t: t[0].rendimento, "qtd"),
        C("Insumo", lambda t: t[1].produto.nome),
        C("Quantidade", lambda t: t[1].quantidade, "qtd"),
        C("Unidade", lambda t: _sigla(t[1].produto)),
        C("Custo da unidade base", lambda t: t[1].produto.custo_unidade_base, "dinheiro"),
        C("Custo", lambda t: Decimal(str(t[1].quantidade)) * Decimal(str(t[1].produto.custo_unidade_base)), "dinheiro", total=True),
    ]
    return Relatorio("Relatório de receitas", "receitas", filtros,
                     Planilha("Receitas", colunas, lista), [Planilha("Insumos das receitas", colunas_itens, itens)])


# ---------------------------------------------------------------- financeiro (só Excel; filtros da listagem)

def _origem_titulo(t) -> str:
    if t.pedido_venda_id:
        return f"Pedido de venda nº {t.pedido_venda_id}"
    if t.pedido_compra_id:
        return f"Pedido de compra nº {t.pedido_compra_id}"
    if t.historico_manutencao_id:
        return "Manutenção de geladeira"
    return "Lançamento avulso"


def _situacao_titulo(t) -> str:
    if t.status in ("aberto", "parcial") and t.vencimento < date.today():
        return "Vencido" + (" (parcial)" if t.status == "parcial" else "")
    return ST_TITULO.get(t.status, t.status)


def financeiro(titulos: list, filtros) -> Relatorio:
    checar_tamanho(len(titulos))
    colunas = [
        C("Nº", lambda t: t.id, "inteiro"),
        C("Tipo", lambda t: "A receber" if t.tipo == "receber" else "A pagar"),
        C("Descrição", lambda t: t.descricao),
        C("Cliente / fornecedor", lambda t: t.cliente_nome or t.fornecedor_nome),
        C("Categoria", lambda t: t.categoria_nome),
        C("Origem", _origem_titulo),
        C("Parcela", lambda t: f"{t.numero_parcela}/{t.total_parcelas}"),
        C("Vencimento", lambda t: t.vencimento, "data"),
        C("Valor", lambda t: t.valor, "dinheiro", total=True),
        C("Pago", lambda t: t.valor_pago, "dinheiro", total=True),
        C("Saldo", lambda t: 0 if t.status == "cancelado" else Decimal(str(t.valor)) - Decimal(str(t.valor_pago or 0)), "dinheiro", total=True),
        C("Taxa da forma (%)", lambda t: t.taxa_percentual if t.tipo == "receber" else None, "pct"),
        C("Situação", _situacao_titulo),
    ]
    baixas = [(t, b) for t in titulos for b in sorted(t.baixas, key=lambda x: (x.data_pagamento, x.id))]
    colunas_baixas = [
        C("Nº do título", lambda x: x[0].id, "inteiro"),
        C("Tipo", lambda x: "Recebimento" if x[0].tipo == "receber" else "Pagamento"),
        C("Descrição do título", lambda x: x[0].descricao),
        C("Cliente / fornecedor", lambda x: x[0].cliente_nome or x[0].fornecedor_nome),
        C("Data do pagamento", lambda x: x[1].data_pagamento, "data"),
        C("Valor", lambda x: 0 if x[1].estornada else x[1].valor, "dinheiro", total=True),
        C("Situação", lambda x: "Estornada" if x[1].estornada else "Válida"),
        C("Observação", lambda x: x[1].observacao),
    ]
    return Relatorio("Relatório financeiro", "financeiro", filtros,
                     Planilha("Títulos", colunas, titulos), [Planilha("Baixas", colunas_baixas, baixas)])


# ---------------------------------------------------------------- geladeiras (Excel do relatório de patrimônio)

def geladeiras(db: Session, *, status: Optional[str], inicio: date, fim: date) -> Relatorio:
    consulta = db.query(Geladeira).options(joinedload(Geladeira.cliente), joinedload(Geladeira.endereco))
    if status:
        consulta = consulta.filter(Geladeira.status == status)
    lista = sorted(consulta.all(), key=lambda g: ((g.cliente.nome if g.cliente else "").lower(), g.numero_serie or "", g.id))
    checar_tamanho(len(lista))
    ini_dt, fim_dt = datetime.combine(inicio, time.min), datetime.combine(fim, time.max)
    manut = (db.query(HistoricoManutencao).options(joinedload(HistoricoManutencao.forma_pagamento))
             .filter(HistoricoManutencao.geladeira_id.in_([g.id for g in lista]),
                     HistoricoManutencao.data >= ini_dt, HistoricoManutencao.data <= fim_dt)
             .order_by(HistoricoManutencao.data).all())
    por_gel: Dict[int, list] = {}
    for m in manut:
        por_gel.setdefault(m.geladeira_id, []).append(m)
    colunas = [
        C("Nº", lambda g: g.id, "inteiro"),
        C("Nº de série", lambda g: g.numero_serie),
        C("Tipo", lambda g: g.tipo),
        C("Marca", lambda g: g.marca),
        C("Modelo", lambda g: g.modelo),
        C("Cliente", lambda g: g.cliente.nome),
        C("Razão social", lambda g: g.cliente.razao_social),
        C("CPF/CNPJ", lambda g: documento_br(g.cliente.cpf_cnpj)),
        C("Endereço de instalação", lambda g: endereco_texto(g.endereco)),
        C("Cidade/UF", lambda g: cidade_uf(g.endereco)),
        C("Data de alocação", lambda g: g.data_alocacao, "data"),
        C("Situação", lambda g: ST_GELADEIRA.get(g.status, g.status)),
        C("Valor de aquisição", lambda g: g.valor_aquisicao, "dinheiro", total=True),
        C("Manutenções no período", lambda g: len(por_gel.get(g.id, [])), "inteiro", total=True),
        C("Gasto com manutenção", lambda g: sum(Decimal(str(m.custo or 0)) for m in por_gel.get(g.id, [])), "dinheiro", total=True),
    ]
    gel_por_id = {g.id: g for g in lista}
    colunas_manut = [
        C("Nº da geladeira", lambda m: m.geladeira_id, "inteiro"),
        C("Nº de série", lambda m: gel_por_id[m.geladeira_id].numero_serie),
        C("Cliente", lambda m: gel_por_id[m.geladeira_id].cliente.nome),
        C("Data", lambda m: m.data, "data"),
        C("Tipo", lambda m: "Preventiva" if m.tipo == "preventiva" else "Corretiva"),
        C("Descrição", lambda m: m.descricao),
        C("Forma de pagamento", lambda m: m.forma_pagamento.descricao if m.forma_pagamento else None),
        C("Custo", lambda m: m.custo, "dinheiro", total=True),
    ]
    filtros = [("Situação", ST_GELADEIRA.get(status, "Todas") if status else "Todas"),
               ("Manutenções", f"de {inicio.strftime('%d/%m/%Y')} a {fim.strftime('%d/%m/%Y')}")]
    return Relatorio("Relatório de geladeiras (patrimônio)", "relatorio-geladeiras", filtros,
                     Planilha("Geladeiras", colunas, lista), [Planilha("Manutenções no período", colunas_manut, manut)])


# módulo -> (função, permissão para exportar, formatos)
MODULOS = {
    "produtos":        (produtos, "cadastros.editar"),
    "clientes":        (clientes, "cadastros.editar"),
    "fornecedores":    (fornecedores, "cadastros.editar"),
    "pedidos-venda":   (pedidos_venda, "vendas.ver"),
    "pedidos-compra":  (pedidos_compra, "compras.ver"),
    "cotacoes":        (cotacoes, "cotacoes.ver"),
    "producao":        (producao, "producao.ver"),
}
