// Service de Formas de Pagamento — única camada que conversa com os endpoints /formas-pagamento.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const formaPagamentoService = {
  async listar({ incluirInativos = false } = {}) {
    const query = incluirInativos ? "?incluir_inativos=true" : "";
    return apiFetch(`/formas-pagamento/${query}`);
  },

  async listarInativos() {
    return apiFetch("/formas-pagamento/inativos");
  },

  async buscarPorId(id) {
    return apiFetch(`/formas-pagamento/${id}`);
  },

  // Somente leitura: como um valor seria dividido nas parcelas da forma de pagamento.
  // `dataBase` (AAAA-MM-DD, opcional) é de onde os prazos contam; sem ela, hoje.
  async simular(id, valor, dataBase = null) {
    const base = dataBase ? `&data_base=${encodeURIComponent(dataBase)}` : "";
    return apiFetch(`/formas-pagamento/${id}/simulacao?valor=${Number(valor).toFixed(2)}${base}`);
  },

  async criar(dados) {
    return apiFetch("/formas-pagamento/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  // Campos omitidos não mudam; se "parcelas" for enviado, a lista inteira é substituída.
  async atualizar(id, dados) {
    return apiFetch(`/formas-pagamento/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  async desativar(id) {
    return apiFetch(`/formas-pagamento/${id}`, {
      method: "DELETE"
    });
  },

  async reativar(id) {
    return apiFetch(`/formas-pagamento/${id}/reativar`, { method: "PATCH" });
  }
};
