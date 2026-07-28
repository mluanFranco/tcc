// Service de Usuários — única camada que conversa com os endpoints /usuarios.
// Acesso restrito a administradores (a tela que consome isso já é protegida
// por exigirAdmin(), mas o backend também valida isso de forma independente).

const usuarioService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/usuarios/${query}`);
  },

  async listarInativos() {
    return apiFetch("/usuarios/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/usuarios/${id}`);
  },

  async criar(dados) {
    return apiFetch("/usuarios/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/usuarios/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true })
    });
  }
};