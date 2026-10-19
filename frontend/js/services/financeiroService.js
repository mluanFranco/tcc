// Service do Financeiro — única camada que conversa com os endpoints /financeiro/titulos.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

// Monta "?a=1&b=2" ignorando o que estiver vazio.
function _queryTitulos(filtros = {}, extras = {}) {
  const params = new URLSearchParams();
  const todos = { ...filtros, ...extras };
  Object.entries(todos).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== "") params.set(chave, String(valor));
  });
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

const financeiroService = {
  // filtros: tipo, status (aberto|parcial|pendente|pago|cancelado), vencido, vencimento_de, vencimento_ate,
  // categoria_id, avulso, busca, cliente_id, fornecedor_id, pedido_venda_id, pedido_compra_id
  async listarTitulos(filtros = {}, { limit = 100, offset = 0 } = {}) {
    return apiFetch(`/financeiro/titulos${_queryTitulos(filtros, { limit, offset })}`);
  },

  // Totais dos MESMOS filtros da lista (sem paginação).
  async resumo(filtros = {}) {
    return apiFetch(`/financeiro/titulos/resumo${_queryTitulos(filtros)}`);
  },

  async buscarTitulo(id) {
    return apiFetch(`/financeiro/titulos/${id}`);
  },

  // Lançamento sem pedido. Com repetir_meses cria um título por mês; devolve a lista criada.
  async lancarAvulso(dados) {
    return apiFetch("/financeiro/titulos", { method: "POST", body: JSON.stringify(dados) });
  },

  // Só os campos enviados mudam. Só vale para avulso aberto e sem baixa.
  async editarAvulso(id, dados) {
    return apiFetch(`/financeiro/titulos/${id}`, { method: "PUT", body: JSON.stringify(dados) });
  },

  async cancelarAvulso(id) {
    return apiFetch(`/financeiro/titulos/${id}/cancelar`, { method: "PATCH" });
  },

  // dados: { valor, data_pagamento (AAAA-MM-DD, não pode ser futura), observacao }
  async darBaixa(id, dados) {
    return apiFetch(`/financeiro/titulos/${id}/baixas`, { method: "POST", body: JSON.stringify(dados) });
  },

  async estornarBaixa(tituloId, baixaId) {
    return apiFetch(`/financeiro/titulos/${tituloId}/baixas/${baixaId}/estornar`, { method: "POST" });
  }
};
