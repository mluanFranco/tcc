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
// Permissões extras (as concedidas direto ao usuário, além das do grupo) e foto. Só administrador (a foto também o próprio usuário).
Object.assign(usuarioService, {
  // { admin, grupo, do_grupo: [...], extras: [...], efetivas: [...] }
  async buscarPermissoes(id) {
    return apiFetch(`/usuarios/${id}/permissoes`);
  },

  // Substitui TODAS as extras do usuário; lista vazia remove todas.
  async definirPermissoesExtras(id, permissoes) {
    return apiFetch(`/usuarios/${id}/permissoes`, {
      method: "PUT",
      body: JSON.stringify({ permissoes })
    });
  },

  // JPEG, PNG ou WebP até 2 MB; o backend recorta para 256x256 e regrava em JPEG.
  async enviarFoto(id, arquivo) {
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    return apiFetch(`/usuarios/${id}/foto`, { method: "PUT", body: dados });
  },

  async removerFoto(id) {
    return apiFetch(`/usuarios/${id}/foto`, { method: "DELETE" });
  }
});
