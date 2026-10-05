const categoriaService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/categorias/${query}`);
  },
  async listarInativos() {
    return apiFetch("/categorias/inativos");
  },
  async buscarPorId(id) {
    return apiFetch(`/categorias/${id}`);
  },
  async criar(dados) {
    return apiFetch("/categorias/", { method: "POST", body: JSON.stringify(dados) });
  },
  async atualizar(id, dados) {
    return apiFetch(`/categorias/${id}`, { method: "PUT", body: JSON.stringify(dados) });
  },
  async desativar(id) {
    return apiFetch(`/categorias/${id}`, { method: "DELETE" });
  },
  async reativar(id) {
    return apiFetch(`/categorias/${id}`, { method: "PUT", body: JSON.stringify({ ativo: true }) });
  }
};