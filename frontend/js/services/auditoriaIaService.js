// Service da Auditoria da IA (só administrador) — conversa com /assistente/auditoria e /assistente/auditoria/resumo.
// Nenhuma lógica de UI aqui, apenas chamadas à API.

const auditoriaIaService = {
  _query(filtros) {
    const p = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) p.set(k, v); });
    const texto = p.toString();
    return texto ? `?${texto}` : "";
  },

  // { total, por_status, recusados, erros, duracao_media_ms, usuarios } — ignora o filtro de resultado.
  async resumo({ usuarioId, ferramenta, dataInicio, dataFim } = {}) {
    return apiFetch("/assistente/auditoria/resumo" + this._query({
      usuario_id: usuarioId, ferramenta, data_inicio: dataInicio, data_fim: dataFim
    }));
  },

  // { total, itens: [{ id, usuario_nome, pergunta, ferramenta, entrada, views, status, linhas, duracao_ms, erro, created_at }] }
  // `status` aceita vários valores separados por vírgula.
  async listar({ usuarioId, status, ferramenta, dataInicio, dataFim, limite = 25, offset = 0 } = {}) {
    return apiFetch("/assistente/auditoria" + this._query({
      usuario_id: usuarioId, status, ferramenta, data_inicio: dataInicio, data_fim: dataFim, limite, offset
    }));
  }
};
