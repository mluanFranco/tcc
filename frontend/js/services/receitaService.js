// Service de Receitas — única camada que conversa com os endpoints /receitas.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const receitaService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/receitas/${query}`);
  },

  async buscarPorId(id) {
    return apiFetch(`/receitas/${id}`);
  },

  async criar(dados) {
    return apiFetch("/receitas/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  // PUT: substitui rendimento, observação e a lista inteira de insumos (o produto fabricado não muda).
  async atualizar(id, dados) {
    return apiFetch(`/receitas/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/receitas/${id}`, { method: "DELETE" });
  },

  async reativar(id) {
    return apiFetch(`/receitas/${id}/reativar`, { method: "PATCH" });
  },

  // Somente leitura: o que seria consumido para produzir "quantidade". Não reserva nem altera estoque.
  async simular(id, quantidade) {
    return apiFetch(`/receitas/${id}/simulacao?quantidade=${encodeURIComponent(quantidade)}`);
  }
};
