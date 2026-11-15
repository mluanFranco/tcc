// Service da exportação (PDF/Excel) das listagens — só chamadas à API; devolve Blob.

const exportacaoService = {
  // ids das linhas visíveis (ordem da tela), filtros [[rótulo, valor]] e, na produção, a aba ("ordens" | "receitas").
  listagem(modulo, formato, { ids, filtros = [], aba = null }) {
    return apiFetchBlob(`/exportacao/${modulo}?formato=${formato}`, { method: "POST", body: { ids, filtros, aba } });
  },

  // Financeiro: só Excel, com os mesmos filtros da listagem de títulos.
  financeiro(filtros = {}) {
    const q = Object.entries(filtros)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return apiFetchBlob(`/exportacao/financeiro${q ? `?${q}` : ""}`);
  }
};
