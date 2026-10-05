const unidadeMedidaService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/unidades-medida/${query}`);
  },
  async listarInativos() {
    return apiFetch("/unidades-medida/inativos");
  },
  async buscarPorId(id) {
    return apiFetch(`/unidades-medida/${id}`);
  },
  async criar(dados) {
    return apiFetch("/unidades-medida/", { method: "POST", body: JSON.stringify(dados) });
  },
  async atualizar(id, dados) {
    return apiFetch(`/unidades-medida/${id}`, { method: "PUT", body: JSON.stringify(dados) });
  },
  async desativar(id) {
    return apiFetch(`/unidades-medida/${id}`, { method: "DELETE" });
  },
  async reativar(id) {
    return apiFetch(`/unidades-medida/${id}`, { method: "PUT", body: JSON.stringify({ ativo: true }) });
  }
};