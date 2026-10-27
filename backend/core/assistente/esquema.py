"""O que o assistente de IA enxerga: só VIEWS (nunca as tabelas), cada uma documentada e ligada a um módulo.

- As views guardam as regras de negócio (por exemplo, "venda só conta quando confirmada"), então a IA não precisa adivinhá-las.
- Não há CPF/CNPJ, telefone, e-mail, endereço completo, senhas nem observações livres.
- 'modulo' diz qual permissão de leitura (<modulo>.ver) o usuário precisa para consultar a view.
  modulo=None (cadastros): a leitura é livre para qualquer usuário logado, como nas rotas.
- A migration cria as views; um teste compara as colunas deste arquivo com as do banco (nada fica sem documentação).
"""
from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Tuple


@dataclass(frozen=True)
class Coluna:
    nome: str
    tipo: str          # inteiro | texto | decimal | data | data_hora | booleano
    descricao: str


@dataclass(frozen=True)
class ViewInfo:
    nome: str
    modulo: Optional[str]
    descricao: str
    colunas: Tuple[Coluna, ...]


def _c(nome, tipo, descricao=""):
    return Coluna(nome, tipo, descricao)


_VENDA_STATUS = "aberto (reserva estoque), confirmado (é venda de fato, baixa estoque e gera títulos a receber) ou cancelado"

VIEWS: Dict[str, ViewInfo] = {v.nome: v for v in (
    ViewInfo("v_produtos", None,
             "Produtos e insumos, com estoque. Estoque baixo = estoque_atual <= estoque_minimo (coluna abaixo_do_minimo). "
             "Estoques ficam SEMPRE na unidade base (coluna unidade). Produto com embalagem (ex.: Pote de 5 L) é comprado e "
             "vendido na embalagem: 1 embalagem = fator_embalagem unidades base, e os preços são da embalagem.", (
        _c("id", "inteiro"), _c("nome", "texto"), _c("categoria", "texto"), _c("subcategoria", "texto"),
        _c("unidade", "texto", "sigla da unidade base (estoque e receitas), ex.: kg, L, un"),
        _c("embalagem", "texto", "sigla da embalagem de compra/venda, ex.: Pote; nulo = sem embalagem"),
        _c("fator_embalagem", "decimal", "quantas unidades base cabem em 1 embalagem; 1 se não tem embalagem"),
        _c("e_insumo", "booleano", "1 = matéria-prima usada na produção"), _c("e_vendavel", "booleano", "1 = pode ser vendido"),
        _c("preco_custo", "decimal", "da embalagem (custo da unidade base = preco_custo / fator_embalagem)"),
        _c("preco_venda", "decimal", "da embalagem; pode ser nulo em insumos"),
        _c("estoque_atual", "decimal"), _c("estoque_reservado", "decimal", "separado por vendas em aberto"),
        _c("estoque_disponivel", "decimal", "estoque_atual - estoque_reservado"), _c("estoque_minimo", "decimal"),
        _c("abaixo_do_minimo", "booleano", "1 = estoque_atual <= estoque_minimo"), _c("ativo", "booleano", "0 = produto desativado"),
    )),
    ViewInfo("v_clientes", None, "Clientes (sem documento, telefone, e-mail ou endereço completo).", (
        _c("id", "inteiro"), _c("nome", "texto"), _c("tipo", "texto", "PF ou PJ"),
        _c("cidade", "texto", "do endereço principal"), _c("uf", "texto", "do endereço principal"), _c("ativo", "booleano"),
    )),
    ViewInfo("v_fornecedores", None, "Fornecedores (sem CNPJ, telefone, e-mail ou endereço completo).", (
        _c("id", "inteiro"), _c("nome", "texto"), _c("cidade", "texto"), _c("uf", "texto"), _c("ativo", "booleano"),
    )),
    ViewInfo("v_geladeiras", "geladeiras", "Geladeiras (equipamentos) alocadas em clientes.", (
        _c("id", "inteiro"), _c("tipo", "texto"), _c("modelo", "texto"), _c("marca", "texto"), _c("numero_serie", "texto"),
        _c("data_alocacao", "data_hora"), _c("status", "texto", "em_campo, manutencao ou desativada"),
        _c("cliente_id", "inteiro"), _c("cliente", "texto"), _c("cidade", "texto", "do endereço da geladeira"), _c("uf", "texto"),
    )),
    ViewInfo("v_manutencoes", "geladeiras", "Histórico de manutenção das geladeiras.", (
        _c("id", "inteiro"), _c("geladeira_id", "inteiro"), _c("geladeira", "texto", "tipo + modelo"), _c("cliente", "texto"),
        _c("data", "data_hora"), _c("tipo", "texto"), _c("custo", "decimal"),
    )),
    ViewInfo("v_vendas", "vendas", f"Pedidos de venda (um por linha). Status: {_VENDA_STATUS}. "
             "Faturamento = só status 'confirmado', e a data da venda é confirmado_em (não data_pedido).", (
        _c("id", "inteiro"), _c("data_pedido", "data_hora", "quando o pedido foi criado"),
        _c("confirmado_em", "data_hora", "quando a venda se concretizou; nulo se não confirmada"),
        _c("status", "texto"), _c("cliente_id", "inteiro"), _c("cliente", "texto"),
        _c("forma_pagamento", "texto"), _c("valor_total", "decimal"), _c("vendedor", "texto", "usuário que lançou o pedido"),
    )),
    ViewInfo("v_venda_itens", "vendas", "Itens dos pedidos de venda (um por produto). Receita = soma de subtotal das vendas "
             "com status 'confirmado', por confirmado_em.", (
        _c("pedido_venda_id", "inteiro"), _c("data_pedido", "data_hora"), _c("confirmado_em", "data_hora"), _c("status", "texto"),
        _c("cliente_id", "inteiro"), _c("cliente", "texto"), _c("produto_id", "inteiro"), _c("produto", "texto"),
        _c("categoria", "texto"), _c("quantidade", "decimal", "na embalagem do produto (ex.: potes)"),
        _c("fator", "decimal", "unidades base por embalagem neste item"),
        _c("quantidade_base", "decimal", "quantidade x fator, na unidade base (some esta para totais de volume/peso)"),
        _c("preco_unitario", "decimal", "da embalagem"),
        _c("desconto", "decimal", "em reais, não em percentual"), _c("subtotal", "decimal", "quantidade x preço - desconto"),
    )),
    ViewInfo("v_venda_margem", "relatorios", "Margem de lucro por item vendido. Só vendas confirmadas. O custo é o do produto "
             "no momento da confirmação. Margem = subtotal - custo_total. Exige a permissão de relatórios.", (
        _c("pedido_venda_id", "inteiro"), _c("confirmado_em", "data_hora"), _c("cliente", "texto"), _c("produto_id", "inteiro"),
        _c("produto", "texto"), _c("categoria", "texto"), _c("quantidade", "decimal", "na embalagem do produto"),
        _c("subtotal", "decimal", "receita do item"),
        _c("custo_unitario", "decimal"), _c("custo_total", "decimal", "quantidade x custo_unitario"),
        _c("margem", "decimal", "subtotal - custo_total"),
    )),
    ViewInfo("v_compras", "compras", "Pedidos de compra (um por linha). Status: pendente, recebido ou cancelado. "
             "Compra é investimento em estoque, não despesa do resultado.", (
        _c("id", "inteiro"), _c("data_pedido", "data_hora"), _c("data_entrega_prevista", "data_hora"), _c("status", "texto"),
        _c("fornecedor_id", "inteiro"), _c("fornecedor", "texto"), _c("forma_pagamento", "texto"),
        _c("valor_total", "decimal"), _c("comprador", "texto", "usuário que lançou o pedido"),
    )),
    ViewInfo("v_compra_itens", "compras", "Itens dos pedidos de compra, com o que já foi recebido.", (
        _c("pedido_compra_id", "inteiro"), _c("data_pedido", "data_hora"), _c("status", "texto"),
        _c("fornecedor_id", "inteiro"), _c("fornecedor", "texto"), _c("produto_id", "inteiro"), _c("produto", "texto"),
        _c("quantidade", "decimal", "na embalagem do produto"), _c("quantidade_recebida", "decimal", "na embalagem"),
        _c("fator", "decimal", "unidades base por embalagem neste item"),
        _c("quantidade_base", "decimal", "quantidade x fator, na unidade base"),
        _c("preco_unitario", "decimal", "da embalagem"), _c("subtotal", "decimal"),
    )),
    ViewInfo("v_cotacao_itens", "cotacoes", "Itens de cotações de compra (parte = fornecedor) e de venda (parte = cliente). "
             "Status: rascunho, enviada, recebida, aprovada ou recusada.", (
        _c("cotacao_id", "inteiro"), _c("tipo", "texto", "compra ou venda"), _c("data_cotacao", "data_hora"), _c("validade", "data"),
        _c("status", "texto"), _c("parte", "texto", "fornecedor (compra) ou cliente (venda)"), _c("produto_id", "inteiro"),
        _c("produto", "texto"), _c("quantidade", "decimal", "na embalagem do produto"),
        _c("fator", "decimal", "unidades base por embalagem neste item"),
        _c("preco_unitario", "decimal", "da embalagem; nulo se o fornecedor ainda não respondeu"),
        _c("desconto", "decimal"), _c("subtotal", "decimal", "nulo se não houver preço"),
    )),
    ViewInfo("v_receitas", "producao", "Receitas de produção: uma linha por insumo de cada receita.", (
        _c("receita_id", "inteiro"), _c("produto_final", "texto", "o que a receita fabrica"), _c("rendimento", "decimal", "quanto a receita rende"),
        _c("insumo", "texto"), _c("quantidade", "decimal", "quantidade do insumo para o rendimento"), _c("ativa", "booleano"),
    )),
    ViewInfo("v_producao", "producao", "Ordens de produção. Status: aberta, confirmada (consumiu insumos e gerou produto) ou cancelada. "
             "O custo só existe depois de confirmada.", (
        _c("id", "inteiro"), _c("created_at", "data_hora", "quando a ordem foi criada"), _c("produto", "texto", "produto fabricado"),
        _c("quantidade", "decimal"), _c("status", "texto"), _c("custo_total", "decimal"), _c("custo_unitario", "decimal"),
        _c("confirmada_em", "data_hora"), _c("cancelada_em", "data_hora"),
    )),
    ViewInfo("v_titulos", "financeiro", "Contas a pagar (tipo 'pagar', de compras) e a receber (tipo 'receber', de vendas), uma parcela por linha, "
             "incluindo lançamentos avulsos (origem 'avulso', ex.: aluguel). Status: aberto, parcial, pago ou cancelado. "
             "Saldo = o que falta pagar/receber. Vencido = status aberto/parcial com dias_em_atraso > 0.", (
        _c("id", "inteiro"), _c("tipo", "texto", "pagar ou receber"), _c("origem", "texto", "pedido_venda, pedido_compra ou avulso"),
        _c("pedido_id", "inteiro", "id do pedido de origem; nulo se avulso"), _c("parte", "texto", "cliente (receber) ou fornecedor (pagar)"),
        _c("categoria", "texto", "ex.: Vendas, Compra de insumos, Aluguel"), _c("descricao", "texto", "só nos avulsos"),
        _c("numero_parcela", "inteiro"), _c("total_parcelas", "inteiro"), _c("vencimento", "data"),
        _c("valor", "decimal"), _c("valor_pago", "decimal"), _c("saldo", "decimal", "0 se pago ou cancelado"),
        _c("taxa_percentual", "decimal", "taxa da forma de pagamento (só em 'receber')"),
        _c("status", "texto"), _c("dias_em_atraso", "inteiro", "0 se não está vencido"),
    )),
    ViewInfo("v_baixas", "financeiro", "Pagamentos e recebimentos efetivos (baixas) de títulos. Estornada = 1 significa que foi desfeita e não conta.", (
        _c("id", "inteiro"), _c("titulo_id", "inteiro"), _c("tipo", "texto", "pagar ou receber"), _c("parte", "texto"),
        _c("categoria", "texto"), _c("data_pagamento", "data"), _c("valor", "decimal"), _c("estornada", "booleano"),
    )),
)}

NOMES_VIEWS = frozenset(VIEWS)
_SCHEMAS_DO_SISTEMA = frozenset({"information_schema", "mysql", "performance_schema", "sys"})


def nomes_de_tabelas_conhecidas() -> frozenset:
    """Tabelas reais do sistema + schemas internos do MySQL: nomes que um apelido (CTE) não pode usar."""
    from database import Base
    import models  # noqa: F401  (garante que todas as tabelas estão registradas)
    return frozenset(Base.metadata.tables) | _SCHEMAS_DO_SISTEMA | NOMES_VIEWS


def descrever(views: Optional[Iterable[str]] = None) -> str:
    """Texto do esquema para o prompt da IA (usado no passo 15b)."""
    saida = []
    for nome in (views if views is not None else VIEWS):
        v = VIEWS[nome]
        saida.append(f"VIEW {v.nome}: {v.descricao}")
        for c in v.colunas:
            saida.append(f"  - {c.nome} ({c.tipo})" + (f": {c.descricao}" if c.descricao else ""))
    return "\n".join(saida)
