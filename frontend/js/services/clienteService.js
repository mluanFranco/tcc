// Service de Clientes — única camada que conversa com os endpoints /clientes.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const clienteService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/clientes/${query}`);
  },

  async listarInativos() {
    return apiFetch("/clientes/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/clientes/${id}`);
  },

  async criar(dados) {
    return apiFetch("/clientes/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/clientes/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/clientes/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/clientes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};