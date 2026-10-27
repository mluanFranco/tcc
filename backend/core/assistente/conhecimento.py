"""Base de conhecimento do assistente: regras de negócio do sistema, para responder "como funciona X?".
(Os passos de TELA - onde clicar - entram depois que o front-end estiver pronto; até lá a ferramenta avisa isso.)
Cada tópico: (palavras-chave sem acento, texto). Para acrescentar um assunto, basta incluir uma linha em TOPICOS."""
import re
import unicodedata
from typing import Dict, List, Tuple


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


TOPICOS: Dict[str, Tuple[str, str]] = {
    "vendas": ("venda vendas pedido pedidos confirmar confirmado cancelar cliente faturamento receita", """\
PEDIDOS DE VENDA. Começam 'aberto': reservam estoque (estoque_reservado) mas ainda NÃO são venda de fato.
Ao confirmar ('confirmado'): baixa o estoque, congela o custo de cada item (base da margem) e gera os títulos a receber conforme as
parcelas da forma de pagamento. Pedido 'cancelado' libera a reserva. O faturamento só considera pedidos confirmados e a data da
venda é a da confirmação (confirmado_em), não a de criação do pedido. O PDF do pedido pode ser emitido pelo módulo de vendas."""),
    "compras": ("compra compras pedido fornecedor receber recebimento insumo", """\
PEDIDOS DE COMPRA. Status: pendente, recebido ou cancelado. O recebimento dá entrada no estoque dos itens e o pedido gera títulos
a pagar conforme a forma de pagamento. Compra é INVESTIMENTO em estoque, não despesa: ela só vira custo (CMV) quando o produto
é vendido, por isso não entra no resultado do período."""),
    "cotacoes": ("cotacao cotacoes orcamento proposta aprovar aprovada recusada validade", """\
COTAÇÕES. Dois tipos: de COMPRA (parte = fornecedor; o preço pode ficar vazio até o fornecedor responder) e de VENDA (parte = cliente;
com desconto em reais por item). Status: rascunho, enviada, recebida, aprovada, recusada. Ao aprovar, a cotação gera o pedido
correspondente (de compra ou de venda). Também tem PDF para enviar à outra parte."""),
    "producao": ("producao produzir receita receitas ordem insumo rendimento fabricar custo", """\
PRODUÇÃO. A RECEITA define o produto final, o rendimento (quanto uma receita rende) e os insumos com as quantidades. A ORDEM DE PRODUÇÃO
('aberta', 'confirmada' ou 'cancelada') diz quanto fabricar. Ao confirmar, consome os insumos do estoque, dá entrada do produto
final e calcula o custo total e o custo unitário; antes disso não há custo. Ordem cancelada não altera estoque."""),
    "financeiro": ("financeiro titulo titulos pagar receber baixa baixas estorno parcela vencimento atraso inadimplencia categoria avulso saldo", """\
FINANCEIRO. TÍTULOS são as contas: tipo 'receber' (vindos de vendas confirmadas) e 'pagar' (vindos de compras), uma linha por parcela,
mais lançamentos AVULSOS (ex.: aluguel) com categoria financeira própria. Status: aberto, parcial, pago, cancelado. BAIXA é o pagamento
ou recebimento efetivo (pode ser parcial); uma baixa pode ser ESTORNADA e então não conta. Saldo = valor - valor_pago. Vencido =
aberto/parcial com vencimento anterior a hoje (dias_em_atraso). Nas vendas, a forma de pagamento guarda uma taxa percentual."""),
    "relatorios": ("relatorio relatorios resultado margem cmv fluxo caixa previsto resumo serie comparativo ranking competencia", """\
RELATÓRIOS FINANCEIROS (por período). RESUMO por competência: receita (vendas confirmadas), CMV (quantidade x custo congelado na confirmação),
margem bruta, compras (investimento, fora do resultado), despesas e outras receitas por categoria, e resultado. FLUXO DE CAIXA realizado
usa a data do pagamento das baixas (estornadas não contam). FLUXO PREVISTO usa o saldo em aberto pelo vencimento. VENCIDOS agrupa o atraso
em faixas (1-30, 31-60, 61-90, mais de 90 dias). Há também séries (mês, trimestre, estação, ano), comparativo entre dois períodos e
rankings de produtos, clientes e fornecedores. Exigem a permissão de relatórios."""),
    "estoque": ("estoque minimo reservado disponivel baixo produto produtos insumo vendavel unidade embalagem pote saco caixa fator conversao", """\
ESTOQUE. Cada produto tem estoque_atual, estoque_reservado (separado por vendas em aberto), estoque_disponivel (atual - reservado) e
estoque_minimo. Estoque baixo = estoque_atual <= estoque_minimo. Produto pode ser insumo (matéria-prima), vendável ou ambos. As quantidades
aceitam casas decimais (ex.: kg).
EMBALAGEM. O estoque e as receitas ficam sempre na unidade base do produto (ex.: litro). O produto pode ter uma embalagem de compra e venda
(ex.: Pote) com um fator (ex.: 5 = 5 litros por pote). Pedidos e cotações são feitos na embalagem e o estoque se move em quantidade x fator
(2 potes = 10 L). Os preços do cadastro são da embalagem; o custo da unidade base (usado nas receitas e na produção) é o custo / fator."""),
    "geladeiras": ("geladeira geladeiras manutencao freezer expositora equipamento alocacao", """\
GELADEIRAS. Equipamentos do negócio alocados em clientes, com tipo, modelo, marca, número de série, data de alocação e status
(em_campo, manutencao ou desativada). Cada geladeira tem histórico de manutenções (data, tipo e custo)."""),
    "cadastros": ("cadastro cadastros cliente fornecedor produto categoria subcategoria unidade forma pagamento", """\
CADASTROS: produtos (com categoria, subcategoria e unidade de medida), clientes (vários endereços), fornecedores e formas de pagamento
(com parcelas, prazos e taxa). Cadastros são desativados (soft delete), não apagados, para preservar o histórico."""),
    "acesso": ("acesso permissao permissoes grupo grupos usuario usuarios admin perfil senha foto login", """\
ACESSO. Cada usuário pertence a um GRUPO DE ACESSO e pode ter permissões extras. As permissões são por módulo: 'ver' (consultar) e
'editar' (criar e alterar; já inclui ver). O administrador tem tudo e é o único que gerencia usuários, grupos e permissões.
Cadastros são de leitura livre para qualquer usuário logado. Usuário inativo não entra no sistema."""),
    "assistente": ("assistente ia inteligencia artificial pergunta perguntas chat limite privacidade", """\
ASSISTENTE DE IA. Responde perguntas sobre os dados do sistema em linguagem natural. Só LÊ dados: nunca altera nada. Enxerga apenas o que o
próprio usuário já poderia ver nas telas (a permissão de cada módulo vale também aqui) e não tem acesso a documentos, telefones, e-mails
nem endereços completos. Cada pergunta e cada consulta ficam registradas em auditoria. Há um limite de perguntas por hora por usuário."""),
}

AVISO_TELAS = ("Observação: os passos exatos de tela (onde clicar) ainda não estão cadastrados na base do assistente; "
               "explique a regra de negócio e não invente caminhos de menu.")


def buscar(assunto: str) -> str:
    palavras = set(re.findall(r"[a-z0-9]+", _sem_acento(assunto or "")))
    if not palavras:
        return "Informe o assunto. Tópicos disponíveis: " + ", ".join(TOPICOS) + "."
    placar: List[Tuple[int, str]] = []
    for nome, (chaves, _) in TOPICOS.items():
        pontos = len(palavras & set(chaves.split())) + (3 if nome in palavras else 0)
        if pontos:
            placar.append((pontos, nome))
    if not placar:
        return "Não há um tópico sobre isso. Tópicos disponíveis: " + ", ".join(TOPICOS) + "."
    placar.sort(key=lambda x: (-x[0], x[1]))
    escolhidos = [n for _, n in placar[:2]]
    return "\n\n".join(TOPICOS[n][1] for n in escolhidos) + "\n\n" + AVISO_TELAS
