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

  // Contas a pagar geradas pelo pedido (nascem junto com ele). Exige financeiro.ver.
  async listarTitulos(id) {
    return apiFetch(`/pedidos-compra/${id}/titulos`);
  },

  // PDF do pedido, como Blob (a rota exige o token, por isso não dá para usar um link direto).
  async baixarPdf(id) {
    return apiFetchBlob(`/pedidos-compra/${id}/pdf`);
  },

  // Uma entrega (parcial ou total). itens: [{ item_id, quantidade_recebida_agora }] — a quantidade DESTA entrega, não o acumulado.
  async registrarRecebimento(id, itens) {
    return apiFetch(`/pedidos-compra/${id}/receber`, {
      method: "POST",
      body: JSON.stringify({ itens })
    });
  },

  async cancelar(id) {
    return apiFetch(`/pedidos-compra/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelado" })
    });
  }
};
