// Service de Formas de Pagamento — única camada que conversa com os endpoints /formas-pagamento.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const formaPagamentoService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/formas-pagamento/${query}`);
  },

  async listarInativos() {
    return apiFetch("/formas-pagamento/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/formas-pagamento/${id}`);
  },

  async criar(dados) {
    return apiFetch("/formas-pagamento/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/formas-pagamento/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/formas-pagamento/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/formas-pagamento/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};