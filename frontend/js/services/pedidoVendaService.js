// Service de Pedidos de Venda — única camada que conversa com os endpoints /pedidos-venda.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const pedidoVendaService = {
  async listar({ status = null } = {}) {
    const query = status ? `?status=${status}` : "";
    return apiFetch(`/pedidos-venda/${query}`);
  },

  async buscarPorId(id) {
    return apiFetch(`/pedidos-venda/${id}`);
  },

  async criar(dados) {
    return apiFetch("/pedidos-venda/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizarStatus(id, novoStatus) {
    return apiFetch(`/pedidos-venda/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: novoStatus })
    });
  }
};