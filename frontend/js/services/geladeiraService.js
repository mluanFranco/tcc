// Service de Geladeiras — única camada que conversa com os endpoints /geladeiras.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const geladeiraService = {
  // Geladeiras em campo ou em manutenção (as desativadas ficam em listarDesativadas).
  async listar({ clienteId = null } = {}) {
    const query = clienteId ? `?cliente_id=${clienteId}` : "";
    return apiFetch(`/geladeiras/${query}`);
  },

  async listarDesativadas() {
    return apiFetch("/geladeiras/desativadas");
  },

  async buscarPorId(id) {
    return apiFetch(`/geladeiras/${id}`);
  },

  async criar(dados) {
    return apiFetch("/geladeiras/", {
      method: "POST",
      body: JSON.stringify(dados)
    });
  },

  async atualizar(id, dados) {
    return apiFetch(`/geladeiras/${id}`, {
      method: "PUT",
      body: JSON.stringify(dados)
    });
  },

  // Muda só o status: "em_campo" | "manutencao" (desativar/reativar usam as funções abaixo).
  async alterarStatus(id, status) {
    return apiFetch(`/geladeiras/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
  },

  async desativar(id) {
    return apiFetch(`/geladeiras/${id}`, {
      method: "DELETE"
    });
  },

  // Relatório de patrimônio em PDF (Blob). status: "" (todas) | em_campo | manutencao | desativada;
  // dataInicio/dataFim (AAAA-MM-DD, opcionais) limitam o período das manutenções somadas.
  async baixarRelatorioPdf({ status = "", dataInicio = "", dataFim = "" } = {}) {
    const params = Object.entries({ status, data_inicio: dataInicio, data_fim: dataFim })
      .filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return apiFetchBlob(`/geladeiras/relatorio/pdf${params ? `?${params}` : ""}`);
  },

  // Mesmo relatório em Excel (.xlsx): aba das geladeiras + aba das manutenções do período.
  async baixarRelatorioExcel({ status = "", dataInicio = "", dataFim = "" } = {}) {
    const params = Object.entries({ status, data_inicio: dataInicio, data_fim: dataFim })
      .filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return apiFetchBlob(`/geladeiras/relatorio/xlsx${params ? `?${params}` : ""}`);
  },

  async reativar(id) {
    return apiFetch(`/geladeiras/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "em_campo" })
    });
  }
};
