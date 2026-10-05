const subcategoriaService = {
  async listar({ categoriaId = null, incluirInativos = false } = {}) {
    const params = new URLSearchParams();
    if (categoriaId) params.set("categoria_id", categoriaId);
    if (incluirInativos) params.set("incluir_inativos", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/subcategorias/${query}`);
  },
  async listarInativos() {
    return apiFetch("/subcategorias/inativos");
  },
  async buscarPorId(id) {
    return apiFetch(`/subcategorias/${id}`);
  },
  async criar(dados) {
    return apiFetch("/subcategorias/", { method: "POST", body: JSON.stringify(dados) });
  },
  async atualizar(id, dados) {
    return apiFetch(`/subcategorias/${id}`, { method: "PUT", body: JSON.stringify(dados) });
  },
  async desativar(id) {
    return apiFetch(`/subcategorias/${id}`, { method: "DELETE" });
  },
  async reativar(id) {
    return apiFetch(`/subcategorias/${id}`, { method: "PUT", body: JSON.stringify({ ativo: true }) });
  }
};