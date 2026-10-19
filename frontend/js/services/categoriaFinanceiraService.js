// Service de Categorias Financeiras — única camada que conversa com /categorias-financeiras.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const categoriaFinanceiraService = {
  // tipo: "pagar" | "receber" | null (todas)
  async listar({ tipo = null, incluirInativos = false } = {}) {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (incluirInativos) params.set("incluir_inativos", "true");
    const texto = params.toString();
    return apiFetch(`/categorias-financeiras/${texto ? `?${texto}` : ""}`);
  },

  async listarInativas() {
    return apiFetch("/categorias-financeiras/inativos");
  },

  async criar(dados) {
    return apiFetch("/categorias-financeiras/", { method: "POST", body: JSON.stringify(dados) });
  },

  // Só o nome muda (o tipo não: os títulos já lançados dependem dele). Categoria de sistema é barrada.
  async atualizar(id, dados) {
    return apiFetch(`/categorias-financeiras/${id}`, { method: "PUT", body: JSON.stringify(dados) });
  },

  async desativar(id) {
    return apiFetch(`/categorias-financeiras/${id}`, { method: "DELETE" });
  },

  async reativar(id) {
    return apiFetch(`/categorias-financeiras/${id}/reativar`, { method: "PATCH" });
  }
};
