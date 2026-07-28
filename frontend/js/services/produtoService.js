// Service de Produtos — única camada que conversa com os endpoints /produtos.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const produtoService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/produtos/${query}`);
  },

  async listarInativos() {
    return apiFetch("/produtos/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/produtos/${id}`);
  },

  async criar(dados) {
    return apiFetch("/produtos/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/produtos/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/produtos/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/produtos/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};