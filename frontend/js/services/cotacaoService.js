// Service de Cotações — única camada que conversa com os endpoints /cotacoes.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const cotacaoService = {
  async listar({ tipo = null, status = null } = {}) {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
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

  // Campos omitidos não mudam; se "itens" for enviado, a lista inteira é substituída.
  async atualizar(id, dados) {
    return apiFetch(`/cotacoes/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async atualizarStatus(id, novoStatus) {
    return apiFetch(`/cotacoes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: novoStatus })
    });
  },

  // Aprova e gera o pedido correspondente numa só transação. Devolve { cotacao, pedido_tipo, pedido_id }.
  async aprovar(id) {
    return apiFetch(`/cotacoes/${id}/aprovar`, { method: "POST" });
  },

  async excluir(id) {
    return apiFetch(`/cotacoes/${id}`, {
      method: "DELETE"
    });
  },

  // PDF da cotação, como Blob (a rota exige o token, por isso não dá para usar um link direto).
  async baixarPdf(id) {
    return apiFetchBlob(`/cotacoes/${id}/pdf`);
  },

  async comparativoPorProduto(produtoId) {
    return apiFetch(`/cotacoes/comparativo/${produtoId}`);
  }
};
