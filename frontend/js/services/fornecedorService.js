// Service de Fornecedores — única camada que conversa com os endpoints /fornecedores.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const fornecedorService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/fornecedores/${query}`);
  },

  async listarInativos() {
    return apiFetch("/fornecedores/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/fornecedores/${id}`);
  },

  async criar(dados) {
    return apiFetch("/fornecedores/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/fornecedores/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/fornecedores/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/fornecedores/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};