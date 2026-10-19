// Tabela e resumo da simulação de produção (GET /receitas/{id}/simulacao).
// Usada na Nova Ordem, no detalhe da ordem aberta e no simulador da receita.
// Recebe sempre o objeto devolvido pela API; não faz chamadas.

function _textoQuantidade(valor, sigla) {
  return `${formatarNumero(valor)}${sigla ? " " + escaparHtml(sigla) : ""}`;
}

function _situacaoDoInsumo(item) {
  if (!item.insumo_ativo) return '<span class="situacao-insumo situacao-insumo--inativo">Insumo inativo</span>';
  if (!item.suficiente) return `<span class="situacao-insumo situacao-insumo--falta">Falta ${_textoQuantidade(item.falta, item.unidade_sigla)}</span>`;
  return '<span class="situacao-insumo situacao-insumo--ok">Suficiente</span>';
}

function htmlTabelaSimulacao(sim) {
  const linhas = sim.itens.map(item => `
    <tr>
      <td>${escaparHtml(item.produto_nome)}</td>
      <td class="num">${_textoQuantidade(item.necessario, item.unidade_sigla)}</td>
      <td class="num">${_textoQuantidade(item.disponivel, item.unidade_sigla)}</td>
      <td>${_situacaoDoInsumo(item)}</td>
    </tr>`).join("");
  return `
    <table class="tabela-itens-leitura">
      <thead>
        <tr><th>Insumo</th><th class="num">Necessário</th><th class="num">Disponível</th><th>Situação</th></tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

// { classe, texto } para a faixa de resumo abaixo da tabela
function resumoDaSimulacao(sim) {
  const faltando = sim.itens.filter(i => !i.suficiente).map(i => i.produto_nome);
  const inativos = sim.itens.filter(i => !i.insumo_ativo).map(i => i.produto_nome);
  if (!sim.receita_ativa) {
    return { classe: "falta", texto: "A receita está inativa: reative-a para poder confirmar a produção." };
  }
  if (inativos.length) {
    return { classe: "falta", texto: `Insumo inativo na receita: ${inativos.join(", ")}. Corrija a receita antes de confirmar.` };
  }
  if (faltando.length) {
    return { classe: "falta", texto: `Estoque insuficiente de: ${faltando.join(", ")}. A ordem pode ser criada, mas só poderá ser confirmada quando houver estoque.` };
  }
  return { classe: "ok", texto: "Há estoque suficiente de todos os insumos para esta produção." };
}

// Desenha tabela + resumo + custo estimado dentro de "container".
function renderizarSimulacao(container, sim) {
  const resumo = resumoDaSimulacao(sim);
  const unitario = Number(sim.quantidade) > 0 ? sim.custo_estimado / Number(sim.quantidade) : 0;
  container.innerHTML = `
    ${htmlTabelaSimulacao(sim)}
    <div class="resumo-simulacao resumo-simulacao--${resumo.classe}">${escaparHtml(resumo.texto)}</div>
    <div class="resumo-custos">
      <div class="resumo-custos__bloco">
        <span class="resumo-custos__rotulo">Custo estimado</span>
        <span class="resumo-custos__valor">${formatarMoeda(sim.custo_estimado)}</span>
      </div>
      <div class="resumo-custos__bloco">
        <span class="resumo-custos__rotulo">Custo unitário estimado</span>
        <span class="resumo-custos__valor resumo-custos__valor--secundario">${formatarMoeda(Math.round(unitario * 100) / 100)}</span>
      </div>
    </div>`;
}
