// Service de Histórico de Manutenção — única camada que conversa com /manutencoes.

const historicoManutencaoService = {
  async listar({ geladeiraId = null } = {}) {
    const query = geladeiraId ? `?geladeira_id=${geladeiraId}` : "";
    return apiFetch(`/manutencoes/${query}`);
  },

  async criar(dados) {
    return apiFetch("/manutencoes/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async excluir(id) {
    return apiFetch(`/manutencoes/${id}`, {
      method: "DELETE"
    });
  }
};