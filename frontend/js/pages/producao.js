// Produção: lista de Ordens de Produção e de Receitas (duas abas na mesma página).
// Criar e ver/editar ficam em ordem-producao-nova/detalhe e receita-nova/detalhe.
// Ordens: status, busca por produto e período são filtros do backend (recarrega ao mudar).
// Receitas: a lista inteira (ativas e inativas) vem de uma vez e o filtro é feito aqui.
// ?aba=receitas abre direto na aba de receitas (os "voltar" das telas de receita usam isso).

let ordensRequisicao = 0;   // descarta respostas antigas se o usuário trocar de filtro rápido
let receitasCache = [];
let filtroStatusOrdens = "todos";
let filtroSituacaoReceitas = "ativas";

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("producao.ver")) return;

  const podeEditar = temPermissao("producao.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    botaoIncluir: $("botao-incluir"), textoBotaoIncluir: $("texto-botao-incluir"),
    abaOrdens: $("aba-ordens"), abaReceitas: $("aba-receitas"),
    painelOrdens: $("painel-ordens"), painelReceitas: $("painel-receitas"),
    // ordens
    buscaOrdens: $("campo-busca-ordens"), dataInicio: $("campo-data-inicio"), dataFim: $("campo-data-fim"),
    abasStatus: document.querySelectorAll(".aba-status[data-status]"),
    corpoOrdens: $("tabela-ordens-corpo"), carregandoOrdens: $("estado-carregando-ordens"), vazioOrdens: $("estado-vazio-ordens"),
    // receitas
    buscaReceitas: $("campo-busca-receitas"), abasSituacao: document.querySelectorAll(".aba-status[data-situacao]"),
    corpoReceitas: $("tabela-receitas-corpo"), carregandoReceitas: $("estado-carregando-receitas"), vazioReceitas: $("estado-vazio-receitas")
  };

  const ROTULOS_STATUS = { aberta: "Aberta", confirmada: "Confirmada", cancelada: "Cancelada" };
  let abaAtual = "ordens";

  // ---------- Ordens ----------

  function periodoInvalido() {
    return Boolean(el.dataInicio.value && el.dataFim.value && el.dataInicio.value > el.dataFim.value);
  }

  function mostrarVazioOrdens(texto, aviso = false) {
    el.corpoOrdens.innerHTML = "";
    el.vazioOrdens.textContent = texto;
    el.vazioOrdens.classList.toggle("aviso-periodo", aviso);
    el.vazioOrdens.hidden = false;
  }

  function celulaCusto(ordem) {
    if (ordem.status === "confirmada") return `<td class="celula-numero">${formatarMoeda(ordem.custo_total)}</td>`;
    if (ordem.status === "cancelada" && ordem.custo_total == null) return '<td class="celula-numero celula-sem-valor">—</td>';
    if (ordem.status === "cancelada") return `<td class="celula-numero">${formatarMoeda(ordem.custo_total)}</td>`;
    // aberta: custo estimado pela receita atual
    const estimado = ordem.itens.reduce((soma, i) => soma + Number(i.subtotal || 0), 0);
    return `<td class="celula-numero celula-estimado">${formatarMoeda(Math.round(estimado * 100) / 100)}<small>estimado</small></td>`;
  }

  function renderizarOrdens(lista) {
    el.carregandoOrdens.hidden = true;
    if (lista.length === 0) {
      const filtrando = filtroStatusOrdens !== "todos" || el.buscaOrdens.value.trim() || el.dataInicio.value || el.dataFim.value;
      mostrarVazioOrdens(filtrando ? "Nenhuma ordem encontrada com esses filtros." : "Nenhuma ordem de produção registrada.");
      return;
    }
    el.vazioOrdens.hidden = true;
    el.corpoOrdens.innerHTML = lista.map(o => `
      <tr class="linha-clicavel" data-id="${o.id}" tabindex="0">
        <td class="celula-nome">${formatarNumeroPedido(o.id)}</td>
        <td>${escaparHtml(o.produto_nome)}</td>
        <td class="celula-numero">${formatarNumero(o.quantidade)}${o.unidade_sigla ? " " + escaparHtml(o.unidade_sigla) : ""}</td>
        ${celulaCusto(o)}
        <td>${formatarData(o.created_at)}</td>
        <td><span class="badge-status badge-status--${escaparHtml(o.status)}">${escaparHtml(ROTULOS_STATUS[o.status] || o.status)}</span></td>
      </tr>`).join("");
  }

  async function carregarOrdens() {
    if (periodoInvalido()) {
      ordensRequisicao++;
      mostrarVazioOrdens("Período inválido: a data inicial é posterior à data final.", true);
      el.carregandoOrdens.hidden = true;
      return;
    }
    const minha = ++ordensRequisicao;
    el.corpoOrdens.innerHTML = "";
    el.vazioOrdens.hidden = true;
    el.carregandoOrdens.hidden = false;
    try {
      const dados = await ordemProducaoService.listar({
        status: filtroStatusOrdens === "todos" ? null : filtroStatusOrdens,
        busca: el.buscaOrdens.value.trim(),
        dataInicio: el.dataInicio.value,
        dataFim: el.dataFim.value
      });
      if (minha !== ordensRequisicao) return;
      renderizarOrdens(dados);
    } catch (erro) {
      if (minha !== ordensRequisicao) return;
      mostrarVazioOrdens("Não foi possível carregar as ordens de produção.");
      el.carregandoOrdens.hidden = true;
      toast.erro(erro.message);
    }
  }

  const abrirOrdem = (linha) => { if (linha) window.location.href = `ordem-producao-detalhe.html?id=${linha.dataset.id}`; };
  el.corpoOrdens.addEventListener("click", (e) => abrirOrdem(e.target.closest("tr[data-id]")));
  el.corpoOrdens.addEventListener("keydown", (e) => { if (e.key === "Enter") abrirOrdem(e.target.closest("tr[data-id]")); });

  el.abasStatus.forEach(aba => {
    aba.addEventListener("click", () => {
      el.abasStatus.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroStatusOrdens = aba.dataset.status;
      carregarOrdens();
    });
  });

  let temporizadorBusca = null;
  el.buscaOrdens.addEventListener("input", () => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(carregarOrdens, 300);
  });
  el.dataInicio.addEventListener("change", carregarOrdens);
  el.dataFim.addEventListener("change", carregarOrdens);

  // ---------- Receitas ----------

  function receitasFiltradas() {
    const termo = el.buscaReceitas.value.trim().toLowerCase();
    return receitasCache.filter(r => {
      if (filtroSituacaoReceitas === "ativas" && !r.ativo) return false;
      if (filtroSituacaoReceitas === "inativas" && r.ativo) return false;
      return !termo || r.produto_nome.toLowerCase().includes(termo);
    });
  }

  function renderizarReceitas() {
    el.carregandoReceitas.hidden = true;
    const lista = receitasFiltradas();
    if (lista.length === 0) {
      el.corpoReceitas.innerHTML = "";
      el.vazioReceitas.textContent = receitasCache.length > 0 ? "Nenhuma receita encontrada com esses filtros." : "Nenhuma receita cadastrada.";
      el.vazioReceitas.hidden = false;
      return;
    }
    el.vazioReceitas.hidden = true;
    el.corpoReceitas.innerHTML = lista.map(r => `
      <tr class="linha-clicavel" data-id="${r.id}" tabindex="0">
        <td class="celula-nome">${escaparHtml(r.produto_nome)}</td>
        <td class="celula-numero">${formatarNumero(r.rendimento)}${r.unidade_sigla ? " " + escaparHtml(r.unidade_sigla) : ""}</td>
        <td class="celula-numero">${r.itens.length}</td>
        <td class="celula-numero">${formatarMoeda(r.custo_total_estimado)}</td>
        <td class="celula-numero">${formatarMoeda(r.custo_unitario_estimado)}</td>
        <td><span class="badge-status badge-status--${r.ativo ? "ativo" : "inativo"}">${r.ativo ? "Ativa" : "Inativa"}</span></td>
      </tr>`).join("");
  }

  async function carregarReceitas() {
    el.carregandoReceitas.hidden = false;
    el.vazioReceitas.hidden = true;
    try {
      receitasCache = await receitaService.listar({ incluirInativos: true });
      renderizarReceitas();
    } catch (erro) {
      receitasCache = [];
      el.carregandoReceitas.hidden = true;
      el.corpoReceitas.innerHTML = "";
      el.vazioReceitas.textContent = "Não foi possível carregar as receitas.";
      el.vazioReceitas.hidden = false;
      toast.erro(erro.message);
    }
  }

  const abrirReceita = (linha) => { if (linha) window.location.href = `receita-detalhe.html?id=${linha.dataset.id}`; };
  el.corpoReceitas.addEventListener("click", (e) => abrirReceita(e.target.closest("tr[data-id]")));
  el.corpoReceitas.addEventListener("keydown", (e) => { if (e.key === "Enter") abrirReceita(e.target.closest("tr[data-id]")); });

  el.abasSituacao.forEach(aba => {
    aba.addEventListener("click", () => {
      el.abasSituacao.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroSituacaoReceitas = aba.dataset.situacao;
      renderizarReceitas();
    });
  });
  el.buscaReceitas.addEventListener("input", renderizarReceitas);

  // ---------- Abas e botão principal ----------

  let receitasCarregadas = false;

  function trocarAba(aba, { atualizarUrl = true } = {}) {
    abaAtual = aba;
    const ordens = aba === "ordens";
    el.abaOrdens.classList.toggle("aba-secundaria--ativa", ordens);
    el.abaReceitas.classList.toggle("aba-secundaria--ativa", !ordens);
    el.painelOrdens.hidden = !ordens;
    el.painelReceitas.hidden = ordens;
    el.textoBotaoIncluir.textContent = ordens ? "Nova ordem de produção" : "Nova receita";
    el.botaoIncluir.hidden = !podeEditar;
    if (!ordens && !receitasCarregadas) { receitasCarregadas = true; carregarReceitas(); }
    if (atualizarUrl) history.replaceState(null, "", ordens ? "producao.html" : "producao.html?aba=receitas");
  }

  el.abaOrdens.addEventListener("click", () => trocarAba("ordens"));
  el.abaReceitas.addEventListener("click", () => trocarAba("receitas"));
  el.botaoIncluir.addEventListener("click", () => {
    window.location.href = abaAtual === "ordens" ? "ordem-producao-nova.html" : "receita-nova.html";
  });

  // ---------- Carga ----------

  const params = new URLSearchParams(window.location.search);
  const abaInicial = params.get("aba") === "receitas" ? "receitas" : "ordens";
  trocarAba(abaInicial, { atualizarUrl: false });
  if (abaInicial === "receitas") {
    // a aba de ordens não foi aberta: carrega mesmo assim para estar pronta ao alternar
    carregarOrdens();
  } else {
    await carregarOrdens();
  }
});
