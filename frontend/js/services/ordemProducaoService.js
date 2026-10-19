// Service de Ordens de Produção — única camada que conversa com os endpoints /ordens-producao.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const ordemProducaoService = {
  async listar({ status = null, produtoId = null, busca = "", dataInicio = "", dataFim = "" } = {}) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (produtoId) params.set("produto_id", produtoId);
    if (busca) params.set("busca", busca);
    if (dataInicio) params.set("data_inicio", dataInicio);
    if (dataFim) params.set("data_fim", dataFim);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/ordens-producao/${query}`);
  },

  async buscarPorId(id) {
    return apiFetch(`/ordens-producao/${id}`);
  },

  async criar(dados) {
    return apiFetch("/ordens-producao/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  // status: aberta | confirmada | cancelada (o backend valida as transições)
  async atualizarStatus(id, status) {
    return apiFetch(`/ordens-producao/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }
};
