// Service do Dashboard — única camada que conversa com os relatórios (/financeiro/relatorios) e com o estoque baixo.
// Os cálculos (receita, CMV, margem, atraso...) são todos do backend; aqui só se monta a consulta.
// Datas sempre como objetos Date locais; vão para a API como AAAA-MM-DD.

function dataParaIso(d) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const dashboardService = {
  _q(params) {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v instanceof Date ? dataParaIso(v) : v)}`)
      .join("&");
    return q ? `?${q}` : "";
  },

  // Período atual (b) contra o anterior (a): resumo dos dois e variação % de b em relação a a.
  comparativo(inicioA, fimA, inicioB, fimB) {
    return apiFetch(`/financeiro/relatorios/comparativo${this._q({ inicio_a: inicioA, fim_a: fimA, inicio_b: inicioB, fim_b: fimB })}`);
  },

  serieMensal(inicio, fim) {
    return apiFetch(`/financeiro/relatorios/serie${this._q({ data_inicio: inicio, data_fim: fim, agrupamento: "mes" })}`);
  },

  fluxoCaixa(inicio, fim) {
    return apiFetch(`/financeiro/relatorios/fluxo-caixa${this._q({ data_inicio: inicio, data_fim: fim, agrupamento: "mes" })}`);
  },

  fluxoPrevisto(dataFim) {
    return apiFetch(`/financeiro/relatorios/fluxo-previsto${this._q({ data_fim: dataFim, agrupamento: "mes" })}`);
  },

  vencidos() {
    return apiFetch("/financeiro/relatorios/vencidos");
  },

  vendasPorProduto(inicio, fim, limite = 5) {
    return apiFetch(`/financeiro/relatorios/vendas/por-produto${this._q({ data_inicio: inicio, data_fim: fim, limite })}`);
  },

  vendasPorCliente(inicio, fim, limite = 5) {
    return apiFetch(`/financeiro/relatorios/vendas/por-cliente${this._q({ data_inicio: inicio, data_fim: fim, limite })}`);
  },

  formasDePagamentoVenda(inicio, fim) {
    return apiFetch(`/financeiro/relatorios/por-forma-pagamento${this._q({ data_inicio: inicio, data_fim: fim, origem: "venda" })}`);
  },

  // Ativos com estoque_atual <= estoque_minimo.
  estoqueBaixo() {
    return apiFetch("/produtos/estoque-baixo");
  }
};
