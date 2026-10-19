// Financeiro: contas a receber, contas a pagar e categorias financeiras.
// O detalhe de um título (baixas, estorno, edição) fica em titulo-detalhe.html.
// Os totais dos cards vêm de /financeiro/titulos/resumo e respeitam busca, período, origem e categoria
// (não a aba de situação: os cards mostram o quadro geral e a aba só filtra a lista).

const POR_PAGINA = 100;
const ICONE_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const ICONE_BAIXA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
const ICONE_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const ICONE_LIXEIRA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
const ICONE_REATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("financeiro.ver")) return;
  const podeEditar = temPermissao("financeiro.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    botaoIncluir: $("botao-incluir"), textoBotaoIncluir: $("texto-botao-incluir"),
    abas: document.querySelectorAll(".aba-secundaria[data-aba]"),
    painelTitulos: $("painel-titulos"), painelCategorias: $("painel-categorias"),
    cards: $("cards-resumo"),
    campoBusca: $("campo-busca"), vencDe: $("campo-vencimento-de"), vencAte: $("campo-vencimento-ate"),
    filtroOrigem: $("filtro-origem"), filtroCategoria: $("filtro-categoria"),
    abasSituacao: document.querySelectorAll("#abas-situacao [data-situacao]"),
    cabecalhoParte: $("cabecalho-parte"),
    corpo: $("tabela-titulos-corpo"), carregando: $("estado-carregando"), vazio: $("estado-vazio"),
    rodape: $("rodape-lista"), textoRodape: $("texto-rodape-lista"), botaoMais: $("botao-carregar-mais"),
    // categorias
    abasCategoria: document.querySelectorAll("#abas-categoria-status [data-ativo]"),
    filtroTipoCategoria: $("filtro-tipo-categoria"),
    corpoCategorias: $("tabela-categorias-corpo"), categoriasCarregando: $("categorias-carregando"), categoriasVazio: $("categorias-vazio"),
    modalCategoria: $("modal-categoria"), formCategoria: $("form-categoria"), tituloCategoria: $("categoria-modal-titulo"),
    tipoCategoria: $("categoria-tipo"), tipoCategoriaFixo: $("categoria-tipo-fixo"), nomeCategoria: $("categoria-nome"),
    grupoNomeCategoria: $("grupo-categoria-nome"), erroNomeCategoria: $("erro-categoria-nome"),
    salvarCategoria: $("categoria-salvar"), cancelarCategoria: $("categoria-cancelar"), fecharCategoria: $("categoria-fechar")
  };

  el.botaoIncluir.hidden = !podeEditar;

  let abaAtual = "receber";
  let situacaoAtual = "pendente";
  let titulos = [];
  let temMais = false;
  let reqLista = 0;
  let reqResumo = 0;
  let timerBusca = null;

  // =============================================================== filtros
  function periodoInvalido() {
    return Boolean(el.vencDe.value && el.vencAte.value && el.vencDe.value > el.vencAte.value);
  }

  // Filtros comuns (sem a aba de situação): valem para os cards e para a lista.
  function filtrosBase() {
    const f = { tipo: abaAtual };
    const busca = el.campoBusca.value.trim();
    if (busca) f.busca = busca;
    if (el.vencDe.value) f.vencimento_de = el.vencDe.value;
    if (el.vencAte.value) f.vencimento_ate = el.vencAte.value;
    if (el.filtroCategoria.value) f.categoria_id = el.filtroCategoria.value;
    if (el.filtroOrigem.value === "avulso") f.avulso = true;
    if (el.filtroOrigem.value === "pedido") f.avulso = false;
    return f;
  }

  function filtrosLista() {
    const f = filtrosBase();
    if (situacaoAtual === "pendente") f.status = "pendente";
    else if (situacaoAtual === "vencido") f.vencido = true;
    else if (situacaoAtual === "pago") f.status = "pago";
    else if (situacaoAtual === "cancelado") f.status = "cancelado";
    return f;
  }

  // =============================================================== cards
  function limparCards() {
    el.cards.classList.add("cards-resumo--carregando");
    ["aberto", "vencido", "avencer", "pago"].forEach(n => { $(`card-${n}-valor`).textContent = "—"; });
    ["aberto", "vencido", "avencer"].forEach(n => { $(`card-${n}-detalhe`).innerHTML = "&nbsp;"; });
    $("card-vencido").classList.remove("card-resumo--alerta");
  }

  const textoQuantidade = (n) => `${n} ${n === 1 ? "título" : "títulos"}`;

  function preencherCards(r) {
    el.cards.classList.remove("cards-resumo--carregando");
    $("card-aberto-valor").textContent = formatarMoeda(r.em_aberto.saldo);
    $("card-aberto-detalhe").textContent = textoQuantidade(r.em_aberto.quantidade);
    $("card-vencido-valor").textContent = formatarMoeda(r.vencido.saldo);
    $("card-vencido-detalhe").textContent = textoQuantidade(r.vencido.quantidade);
    $("card-vencido").classList.toggle("card-resumo--alerta", r.vencido.quantidade > 0);
    $("card-avencer-valor").textContent = formatarMoeda(r.a_vencer.saldo);
    $("card-avencer-detalhe").textContent = textoQuantidade(r.a_vencer.quantidade);
    $("card-pago-valor").textContent = formatarMoeda(r.total_pago);
  }

  function rotulosDosCards() {
    const receber = abaAtual === "receber";
    $("card-aberto-rotulo").textContent = receber ? "A receber em aberto" : "A pagar em aberto";
    $("card-vencido").querySelector(".card-resumo__rotulo").textContent = receber ? "Vencido (inadimplência)" : "Vencido (em atraso)";
    $("card-pago-rotulo").textContent = receber ? "Recebido" : "Pago";
    el.cabecalhoParte.textContent = receber ? "Cliente" : "Fornecedor";
  }

  async function carregarResumo() {
    const minha = ++reqResumo;
    try {
      const r = await financeiroService.resumo(filtrosBase());
      if (minha !== reqResumo) return;
      preencherCards(r);
    } catch (erro) {
      if (minha !== reqResumo) return;
      limparCards();
      toast.erro(`Não foi possível carregar os totais. ${erro.message}`);
    }
  }

  // =============================================================== lista
  function mostrarVazio(texto, aviso = false) {
    el.corpo.innerHTML = "";
    el.vazio.textContent = texto;
    el.vazio.classList.toggle("aviso-periodo", aviso);
    el.vazio.hidden = false;
    el.rodape.hidden = true;
  }

  function textoVazio() {
    const filtrando = Boolean(el.campoBusca.value.trim() || el.vencDe.value || el.vencAte.value || el.filtroCategoria.value || el.filtroOrigem.value);
    if (filtrando) return "Nenhum título encontrado com esses filtros.";
    const receber = abaAtual === "receber";
    return {
      pendente: receber ? "Nenhuma conta a receber pendente." : "Nenhuma conta a pagar pendente.",
      vencido: "Nenhum título vencido. Tudo em dia!",
      pago: receber ? "Nenhum título recebido ainda." : "Nenhum título pago ainda.",
      cancelado: "Nenhum título cancelado.",
      todos: "Nenhum título encontrado."
    }[situacaoAtual];
  }

  function linhaTitulo(t) {
    const situacao = situacaoTitulo(t);
    const pendente = estaPendenteTitulo(t);
    const parcela = textoParcelaTitulo(t);
    const sub = [t.categoria_nome, parcela && `parcela ${parcela}`].filter(Boolean).map(escaparHtml).join(" · ");
    const atraso = t.vencido ? `<span class="celula-vencimento__atraso">${t.dias_atraso} ${t.dias_atraso === 1 ? "dia" : "dias"} de atraso</span>` : "";
    const nomeBaixa = t.tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento";
    const botaoBaixa = (podeEditar && pendente)
      ? `<button class="botao-icone botao-icone--sucesso" data-acao="baixa" data-id="${t.id}" title="${nomeBaixa}" aria-label="${nomeBaixa}: ${escaparHtml(textoOrigemTitulo(t))}">${ICONE_BAIXA}</button>`
      : "";
    return `
      <tr class="linha-clicavel" data-id="${t.id}" tabindex="0">
        <td class="celula-vencimento">${formatarData(t.vencimento)}${atraso}</td>
        <td><span class="celula-titulo__principal">${escaparHtml(textoOrigemTitulo(t))}</span><span class="celula-titulo__sub">${sub}</span></td>
        <td class="col-parte">${escaparHtml(nomeParteTitulo(t) || "—")}</td>
        <td class="celula-numero">${formatarMoeda(t.valor)}</td>
        <td class="celula-numero">${pendente ? formatarMoeda(t.saldo) : '<span class="saldo-zerado">—</span>'}</td>
        <td><span class="situacao-titulo situacao-titulo--${situacao.classe}">${escaparHtml(situacao.texto)}</span></td>
        <td class="celula-acoes">
          <button class="botao-icone" data-acao="ver" data-id="${t.id}" title="Visualizar" aria-label="Visualizar: ${escaparHtml(textoOrigemTitulo(t))}">${ICONE_OLHO}</button>
          ${botaoBaixa}
        </td>
      </tr>`;
  }

  function renderizarLista() {
    el.carregando.hidden = true;
    if (titulos.length === 0) { mostrarVazio(textoVazio()); return; }
    el.vazio.hidden = true;
    el.corpo.innerHTML = titulos.map(linhaTitulo).join("");
    el.rodape.hidden = false;
    el.textoRodape.textContent = `Mostrando ${titulos.length} ${titulos.length === 1 ? "título" : "títulos"}${temMais ? "" : "."}`;
    el.botaoMais.hidden = !temMais;
  }

  async function carregarLista({ maisUm = false } = {}) {
    const minha = ++reqLista;
    if (!maisUm) {
      titulos = [];
      temMais = false;
      el.corpo.innerHTML = "";
      el.vazio.hidden = true;
      el.rodape.hidden = true;
      el.carregando.hidden = false;
    } else {
      el.botaoMais.disabled = true;
    }
    try {
      const pagina = await financeiroService.listarTitulos(filtrosLista(), { limit: POR_PAGINA, offset: maisUm ? titulos.length : 0 });
      if (minha !== reqLista) return;
      titulos = maisUm ? titulos.concat(pagina) : pagina;
      temMais = pagina.length === POR_PAGINA;
      el.botaoMais.disabled = false;
      renderizarLista();
    } catch (erro) {
      if (minha !== reqLista) return;
      el.botaoMais.disabled = false;
      if (!maisUm) { titulos = []; el.carregando.hidden = true; mostrarVazio("Não foi possível carregar os títulos."); }
      toast.erro(erro.message);
    }
  }

  async function recarregarTudo() {
    if (periodoInvalido()) {
      reqLista++; reqResumo++;
      limparCards();
      el.carregando.hidden = true;
      mostrarVazio("Período inválido: a data inicial é posterior à data final.", true);
      return;
    }
    el.vazio.classList.remove("aviso-periodo");
    await Promise.all([carregarResumo(), carregarLista()]);
  }

  function abrirTitulo(id) {
    window.location.href = `titulo-detalhe.html?id=${id}`;
  }

  function darBaixa(id) {
    const titulo = titulos.find(t => t.id === id);
    if (!titulo) return;
    baixaModal.abrir({ titulo, aoSalvar: recarregarTudo, aoAtualizar: recarregarTudo });
  }

  // =============================================================== filtro de categoria (aba de títulos)
  async function carregarFiltroCategoria() {
    const anterior = el.filtroCategoria.value;
    el.filtroCategoria.innerHTML = "";
    const todas = document.createElement("option");
    todas.value = "";
    todas.textContent = "Todas as categorias";
    el.filtroCategoria.appendChild(todas);
    try {
      const categorias = await categoriaFinanceiraService.listar({ tipo: abaAtual, incluirInativos: true });
      categorias.forEach(c => {
        const o = document.createElement("option");
        o.value = String(c.id);
        o.textContent = c.ativo ? c.nome : `${c.nome} (inativa)`;
        el.filtroCategoria.appendChild(o);
      });
      if (anterior && [...el.filtroCategoria.options].some(o => o.value === anterior)) el.filtroCategoria.value = anterior;
    } catch (erro) {
      toast.erro(`Não foi possível carregar as categorias. ${erro.message}`);
    }
  }

  // =============================================================== abas
  function trocarAba(aba, { atualizarUrl = true } = {}) {
    const mudouTipo = aba !== "categorias" && aba !== abaAtual;
    abaAtual = aba;
    el.abas.forEach(b => {
      const ativa = b.dataset.aba === aba;
      b.classList.toggle("aba-secundaria--ativa", ativa);
      b.setAttribute("aria-selected", String(ativa));
    });
    const categorias = aba === "categorias";
    el.painelTitulos.hidden = categorias;
    el.painelCategorias.hidden = !categorias;
    el.textoBotaoIncluir.textContent = categorias ? "Nova categoria" : "Novo lançamento";
    if (atualizarUrl) history.replaceState(null, "", `${location.pathname}?aba=${aba}`);
    if (categorias) { carregarCategorias(); return; }
    rotulosDosCards();
    if (mudouTipo || !el.filtroCategoria.options.length) el.filtroCategoria.value = "";
    carregarFiltroCategoria().then(() => { if (abaAtual === aba) recarregarTudo(); });
    limparCards();
  }

  // =============================================================== categorias
  let categorias = [];
  let categoriasAtivas = true;
  let reqCategorias = 0;
  let modalCategoria = { modo: "novo", categoria: null, tipo: "pagar", inicial: "", enviando: false };

  function categoriasFiltradas() {
    const tipo = el.filtroTipoCategoria.value;
    return categorias.filter(c => c.ativo === categoriasAtivas && (!tipo || c.tipo === tipo));
  }

  function renderizarCategorias() {
    el.categoriasCarregando.hidden = true;
    const lista = categoriasFiltradas();
    if (lista.length === 0) {
      el.corpoCategorias.innerHTML = "";
      el.categoriasVazio.textContent = categoriasAtivas ? "Nenhuma categoria ativa com esse filtro." : "Nenhuma categoria inativa.";
      el.categoriasVazio.hidden = false;
      return;
    }
    el.categoriasVazio.hidden = true;
    el.corpoCategorias.innerHTML = lista.map(c => {
      const acoes = (podeEditar && !c.sistema) ? `
        <button class="botao-icone" data-acao="editar" data-id="${c.id}" title="Editar" aria-label="Editar ${escaparHtml(c.nome)}">${ICONE_EDITAR}</button>
        ${c.ativo
          ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${c.id}" title="Desativar" aria-label="Desativar ${escaparHtml(c.nome)}">${ICONE_LIXEIRA}</button>`
          : `<button class="botao-icone" data-acao="reativar" data-id="${c.id}" title="Reativar" aria-label="Reativar ${escaparHtml(c.nome)}">${ICONE_REATIVAR}</button>`}` : '<span class="espaco-icone" aria-hidden="true"></span>';
      return `
        <tr>
          <td class="celula-nome">${escaparHtml(c.nome)}</td>
          <td><span class="badge-status badge-tipo-categoria--${c.tipo}">${rotuloTipoTitulo(c.tipo)}</span></td>
          <td><span class="badge-status ${c.sistema ? "badge-origem--sistema" : "badge-origem--propria"}" ${c.sistema ? 'title="Usada pelos pedidos; não pode ser alterada"' : ""}>${c.sistema ? "Sistema" : "Personalizada"}</span></td>
          <td><span class="badge-status ${c.ativo ? "badge-status--ativo" : "badge-status--inativo"}">${c.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">${acoes}</td>
        </tr>`;
    }).join("");
  }

  async function carregarCategorias() {
    const minha = ++reqCategorias;
    el.corpoCategorias.innerHTML = "";
    el.categoriasVazio.hidden = true;
    el.categoriasCarregando.hidden = false;
    try {
      const dados = await categoriaFinanceiraService.listar({ incluirInativos: true });
      if (minha !== reqCategorias) return;
      categorias = dados;
      renderizarCategorias();
    } catch (erro) {
      if (minha !== reqCategorias) return;
      categorias = [];
      el.categoriasCarregando.hidden = true;
      el.categoriasVazio.textContent = "Não foi possível carregar as categorias.";
      el.categoriasVazio.hidden = false;
      toast.erro(erro.message);
    }
  }

  function definirTipoCategoria(tipo) {
    modalCategoria.tipo = tipo;
    el.tipoCategoria.querySelectorAll("[data-tipo]").forEach(b => {
      const ativo = b.dataset.tipo === tipo;
      b.classList.toggle("segmentado__opcao--ativa", ativo);
      b.setAttribute("aria-checked", String(ativo));
    });
  }

  const instantaneoCategoria = () => JSON.stringify([modalCategoria.tipo, el.nomeCategoria.value.trim()]);
  const categoriaAlterada = () => el.modalCategoria.classList.contains("aberto") && !modalCategoria.enviando && instantaneoCategoria() !== modalCategoria.inicial;

  function abrirModalCategoria(modo, categoria = null) {
    modalCategoria = { modo, categoria, tipo: categoria ? categoria.tipo : "pagar", inicial: "", enviando: false };
    const editar = modo === "editar";
    el.tituloCategoria.textContent = editar ? "Editar categoria" : "Nova categoria";
    el.tipoCategoria.hidden = editar;
    el.tipoCategoriaFixo.hidden = !editar;
    if (editar) el.tipoCategoriaFixo.textContent = `Categoria de títulos ${rotuloTipoTitulo(categoria.tipo).toLowerCase()}. O tipo não pode ser alterado: os títulos já lançados dependem dele.`;
    el.grupoNomeCategoria.classList.remove("invalido");
    el.nomeCategoria.value = editar ? categoria.nome : "";
    definirTipoCategoria(modalCategoria.tipo);
    el.salvarCategoria.disabled = false;
    el.salvarCategoria.textContent = "Salvar";
    el.cancelarCategoria.disabled = false;
    modalCategoria.inicial = instantaneoCategoria();
    el.modalCategoria.classList.add("aberto");
    el.nomeCategoria.focus();
  }

  async function fecharModalCategoria({ forcar = false } = {}) {
    if (modalCategoria.enviando) return;
    if (!forcar && categoriaAlterada()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar alterações?", mensagem: "O que você preencheu nesta categoria será perdido.",
        textoConfirmar: "Descartar", textoCancelar: "Continuar editando", perigo: true
      });
      if (!descartar) return;
    }
    el.modalCategoria.classList.remove("aberto");
  }

  async function salvarCategoria(evento) {
    evento.preventDefault();
    if (modalCategoria.enviando) return;
    const nome = el.nomeCategoria.value.trim();
    el.grupoNomeCategoria.classList.remove("invalido");
    if (!nome || nome.length > 100) {
      el.erroNomeCategoria.textContent = !nome ? "Informe o nome da categoria." : "No máximo 100 caracteres.";
      el.grupoNomeCategoria.classList.add("invalido");
      el.nomeCategoria.focus();
      return;
    }
    const editar = modalCategoria.modo === "editar";
    if (editar && nome === modalCategoria.categoria.nome) { toast.info("Nenhuma alteração para salvar."); await fecharModalCategoria({ forcar: true }); return; }

    modalCategoria.enviando = true;
    el.salvarCategoria.disabled = true;
    el.cancelarCategoria.disabled = true;
    el.salvarCategoria.textContent = "Salvando...";
    try {
      if (editar) await categoriaFinanceiraService.atualizar(modalCategoria.categoria.id, { nome });
      else await categoriaFinanceiraService.criar({ nome, tipo: modalCategoria.tipo });
      modalCategoria.enviando = false;
      el.modalCategoria.classList.remove("aberto");
      toast.sucesso(editar ? "Categoria atualizada." : "Categoria criada.");
      await carregarCategorias();
    } catch (erro) {
      modalCategoria.enviando = false;
      el.salvarCategoria.disabled = false;
      el.cancelarCategoria.disabled = false;
      el.salvarCategoria.textContent = "Salvar";
      el.erroNomeCategoria.textContent = erro.message;
      el.grupoNomeCategoria.classList.add("invalido");
      toast.erro(erro.message);
    }
  }

  async function desativarCategoria(id) {
    const c = categorias.find(x => x.id === id);
    if (!c) return;
    const ok = await confirmarAcao({
      titulo: `Desativar a categoria "${c.nome}"?`,
      mensagem: "Ela deixa de aparecer nos novos lançamentos. Os títulos já lançados continuam com ela. Você pode reativá-la depois.",
      textoConfirmar: "Desativar", perigo: true
    });
    if (!ok) return;
    try {
      await categoriaFinanceiraService.desativar(id);
      toast.sucesso(`Categoria "${c.nome}" desativada.`);
    } catch (erro) { toast.erro(erro.message); }
    await carregarCategorias();
  }

  async function reativarCategoria(id) {
    const c = categorias.find(x => x.id === id);
    try {
      await categoriaFinanceiraService.reativar(id);
      toast.sucesso(`Categoria${c ? ` "${c.nome}"` : ""} reativada.`);
    } catch (erro) { toast.erro(erro.message); }
    await carregarCategorias();
  }

  // =============================================================== eventos
  el.abas.forEach(b => b.addEventListener("click", () => { if (b.dataset.aba !== abaAtual) trocarAba(b.dataset.aba); }));

  el.botaoIncluir.addEventListener("click", () => {
    if (abaAtual === "categorias") { abrirModalCategoria("novo"); return; }
    lancamentoModal.abrir({
      modo: "novo",
      tipoInicial: abaAtual,
      aoSalvar: async (criados) => {
        const tipo = criados[0]?.tipo;
        if (tipo && tipo !== abaAtual) { situacaoAtual = "pendente"; sincronizarAbasSituacao(); trocarAba(tipo); }
        else await recarregarTudo();
      }
    });
  });

  function sincronizarAbasSituacao() {
    el.abasSituacao.forEach(a => a.classList.toggle("aba-status--ativa", a.dataset.situacao === situacaoAtual));
  }

  el.abasSituacao.forEach(aba => aba.addEventListener("click", () => {
    situacaoAtual = aba.dataset.situacao;
    sincronizarAbasSituacao();
    if (periodoInvalido()) return;
    carregarLista();
  }));

  el.campoBusca.addEventListener("input", () => { clearTimeout(timerBusca); timerBusca = setTimeout(recarregarTudo, 300); });
  [el.vencDe, el.vencAte, el.filtroOrigem, el.filtroCategoria].forEach(c => c.addEventListener("change", recarregarTudo));
  el.botaoMais.addEventListener("click", () => carregarLista({ maisUm: true }));

  el.corpo.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (botao) {
      const id = Number(botao.dataset.id);
      if (botao.dataset.acao === "ver") abrirTitulo(id);
      else if (botao.dataset.acao === "baixa") darBaixa(id);
      return;
    }
    const linha = e.target.closest("tr[data-id]");
    if (linha) abrirTitulo(linha.dataset.id);
  });
  el.corpo.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.closest("button")) return;
    const linha = e.target.closest("tr[data-id]");
    if (linha) abrirTitulo(linha.dataset.id);
  });

  el.abasCategoria.forEach(a => a.addEventListener("click", () => {
    categoriasAtivas = a.dataset.ativo === "true";
    el.abasCategoria.forEach(x => x.classList.toggle("aba-status--ativa", x === a));
    renderizarCategorias();
  }));
  el.filtroTipoCategoria.addEventListener("change", renderizarCategorias);
  el.corpoCategorias.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === "editar") abrirModalCategoria("editar", categorias.find(c => c.id === id));
    else if (botao.dataset.acao === "desativar") desativarCategoria(id);
    else if (botao.dataset.acao === "reativar") reativarCategoria(id);
  });

  el.tipoCategoria.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]");
    if (b && modalCategoria.modo === "novo") definirTipoCategoria(b.dataset.tipo);
  });
  el.formCategoria.addEventListener("submit", salvarCategoria);
  el.fecharCategoria.addEventListener("click", () => fecharModalCategoria());
  el.cancelarCategoria.addEventListener("click", () => fecharModalCategoria());
  el.modalCategoria.addEventListener("mousedown", (e) => { if (e.target === el.modalCategoria) fecharModalCategoria(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.modalCategoria.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) fecharModalCategoria();
  });
  window.addEventListener("beforeunload", (e) => { if (categoriaAlterada()) { e.preventDefault(); e.returnValue = ""; } });

  // =============================================================== início
  const abaInicial = new URLSearchParams(location.search).get("aba");
  const valida = ["receber", "pagar", "categorias"].includes(abaInicial) ? abaInicial : "receber";
  abaAtual = valida === "receber" ? "pagar" : "receber";   // força "mudança" na primeira troca
  trocarAba(valida, { atualizarUrl: abaInicial !== null });
});
