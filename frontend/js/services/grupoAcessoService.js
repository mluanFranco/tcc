// Service de Grupos de Acesso — única camada que conversa com os endpoints /grupos-acesso.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API. Todos os endpoints são só de administrador.

const grupoAcessoService = {
  // Ativos e inativos juntos (a tela separa em abas). Cada grupo traz `permissoes` (códigos) e `total_usuarios` (ativos).
  async listar({ incluirInativos = true } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/grupos-acesso/${query}`);
  },

  // Catálogo: [{ modulo, descricao, permissoes: [{ codigo, acao, descricao }] }], na ordem em que a tela deve listar.
  async listarPermissoes() {
    return apiFetch("/grupos-acesso/permissoes");
  },

  async buscarPorId(id) {
    return apiFetch(`/grupos-acesso/${id}`);
  },

  async criar(dados) {
    return apiFetch("/grupos-acesso/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/grupos-acesso/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/grupos-acesso/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/grupos-acesso/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};
