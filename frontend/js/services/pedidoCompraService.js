// Service de Pedidos de Compra — única camada que conversa com os endpoints /pedidos-compra.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const pedidoCompraService = {
  async listar({ status = null } = {}) {
    const query = status ? `?status=${status}` : "";
    return apiFetch(`/pedidos-compra/${query}`);
  },

  async buscarPorId(id) {
    return apiFetch(`/pedidos-compra/${id}`);
  },

  async criar(dados) {
    return apiFetch("/pedidos-compra/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async registrarRecebimento(id, itensRecebidos) {
    return apiFetch(`/pedidos-compra/${id}/receber`, {
      method: "POST",
      body: JSON.stringify({ itens: itensRecebidos })
    });
  },

  async cancelar(id) {
    return apiFetch(`/pedidos-compra/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelado" })
    });
  }
};