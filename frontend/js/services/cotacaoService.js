// Service de Cotações — única camada que conversa com os endpoints /cotacoes.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const cotacaoService = {
  async listar({ fornecedorId = null, status = null } = {}) {
    const params = new URLSearchParams();
    if (fornecedorId) params.set("fornecedor_id", fornecedorId);
    if (status) params.set("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/cotacoes/${query}`);
  },

  async buscarPorId(id) {
    return apiFetch(`/cotacoes/${id}`);
  },

  async criar(dados) {
    return apiFetch("/cotacoes/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizarStatus(id, novoStatus) {
    return apiFetch(`/cotacoes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: novoStatus })
    });
  },

  async excluir(id) {
    return apiFetch(`/cotacoes/${id}`, {
      method: "DELETE"
    });
  },

  async comparativoPorProduto(produtoId) {
    return apiFetch(`/cotacoes/comparativo/${produtoId}`);
  }
};