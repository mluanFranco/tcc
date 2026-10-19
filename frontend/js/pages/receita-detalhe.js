// Detalhe da Receita: leitura, simulador de produção, desativar/reativar e edição (o mesmo formulário da Nova Receita).
//
// Regras do backend que a tela respeita:
//  - O PUT substitui rendimento, observação e a lista inteira de insumos; o produto fabricado não muda.
//  - Ordens ABERTAS usam a receita atual (o consumo delas é só uma prévia até a confirmação): alterar a receita
//    muda o que elas vão consumir. A tela avisa quando há ordens abertas.
//  - Receita inativa não gera nem confirma ordens. Reativar exige que o produto fabricado esteja ativo.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("producao.ver")) return;

  const params = new URLSearchParams(window.location.search);
  const receitaId = Number(params.get("id"));
  const recemCriada = params.get("novo") === "1";

  const podeEditar = temPermissao("producao.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    estadoPagina: $("estado-pagina"), conteudo: $("conteudo-receita"), titulo: $("titulo-receita"),
    pilulaStatus: $("pilula-status"), faixaAviso: $("faixa-aviso"), linkVoltar: $("link-voltar"),
    botaoProduzir: $("botao-produzir"), botaoEditar: $("botao-editar"), botaoDesativar: $("botao-desativar"),
    botaoReativar: $("botao-reativar"), botaoSalvar: $("botao-salvar"), botaoCancelarEdicao: $("botao-cancelar-edicao"),
    vista: $("vista"), edicao: $("edicao"),
    produto: $("vis-produto"), rendimento: $("vis-rendimento"), abertas: $("vis-abertas"),
    atualizada: $("vis-atualizada"), observacao: $("vis-observacao"),
    itensCorpo: $("itens-corpo"), custoTotal: $("vis-custo-total"), custoUnitario: $("vis-custo-unitario"),
    rotuloUnitario: $("vis-rotulo-unitario"),
    cartaoSimulador: $("cartao-simulador"), simuladorQuantidade: $("simulador-quantidade"),
    simuladorResultado: $("simulador-resultado"), rotuloSimulador: $("rotulo-simulador")
  };

  let receita = null;
  let ordensAbertas = null;     // número, ou null se não foi possível consultar
  let ocupado = false;
  let modoEdicao = false;
  let formulario = null;
  let salvando = false;
  let saindo = false;
  let requisicaoSimulacao = 0;
  let temporizadorSimulacao = null;

  const sigla = () => receita.unidade_sigla || "";

  function mostrarErroDePagina(mensagem) {
    el.estadoPagina.textContent = mensagem;
    el.estadoPagina.hidden = false;
    el.conteudo.hidden = true;
  }

  // ---------- Desenho (leitura) ----------

  function renderizarReceita() {
    el.titulo.textContent = `Receita: ${receita.produto_nome}`;
    el.pilulaStatus.textContent = receita.ativo ? "Ativa" : "Inativa";
    el.pilulaStatus.className = `pilula-status pilula-status--${receita.ativo ? "ativa" : "inativa"}`;

    el.produto.textContent = receita.produto_nome;
    el.rendimento.textContent = `${formatarNumero(receita.rendimento)}${sigla() ? " " + sigla() : ""}`;
    el.abertas.textContent = ordensAbertas === null ? "—" : (ordensAbertas === 0 ? "Nenhuma" : String(ordensAbertas));
    el.atualizada.textContent = formatarDataHora(receita.updated_at);
    el.observacao.textContent = receita.observacao || "—";

    el.itensCorpo.innerHTML = receita.itens.slice().sort((a, b) => a.id - b.id).map(item => `
      <tr>
        <td>${escaparHtml(item.produto_nome)}${item.insumo_ativo ? "" : '<span class="tag-insumo-inativo">Inativo</span>'}</td>
        <td class="num">${formatarNumero(item.quantidade)}${item.unidade_sigla ? " " + escaparHtml(item.unidade_sigla) : ""}</td>
        <td class="num">${formatarMoeda(item.preco_custo)}</td>
        <td class="num subtotal">${formatarMoeda(item.subtotal)}</td>
      </tr>`).join("");
    el.custoTotal.textContent = formatarMoeda(receita.custo_total_estimado);
    el.custoUnitario.textContent = formatarMoeda(receita.custo_unitario_estimado);
    el.rotuloUnitario.textContent = sigla() ? `Custo por ${sigla()}` : "Custo por unidade";
    el.rotuloSimulador.textContent = `Quanto quero produzir${sigla() ? " (" + sigla() + ")" : ""}`;

    const avisos = [];
    if (!receita.ativo) avisos.push("Esta receita está inativa: não é possível criar nem confirmar ordens de produção com ela.");
    const inativos = receita.itens.filter(i => !i.insumo_ativo).map(i => i.produto_nome);
    if (inativos.length) avisos.push(`Insumo inativo na receita: ${inativos.join(", ")}. Edite a receita para trocá-lo ou removê-lo.`);
    el.faixaAviso.textContent = avisos.join(" ");
    el.faixaAviso.hidden = avisos.length === 0;

    document.title = `Receita ${receita.produto_nome} — Nova Sorvetes`;
    el.estadoPagina.hidden = true;
    el.conteudo.hidden = false;
    atualizarBotoes();
    agendarSimulacao(0);
  }

  function atualizarBotoes() {
    const leitura = !modoEdicao;
    el.botaoProduzir.hidden = !(leitura && podeEditar && receita.ativo);
    el.botaoEditar.hidden = !(leitura && podeEditar);
    el.botaoDesativar.hidden = !(leitura && podeEditar && receita.ativo);
    el.botaoReativar.hidden = !(leitura && podeEditar && !receita.ativo);
    el.botaoSalvar.hidden = leitura;
    el.botaoCancelarEdicao.hidden = leitura;
    el.vista.hidden = !leitura;
    el.edicao.hidden = leitura;
    [el.botaoProduzir, el.botaoEditar, el.botaoDesativar, el.botaoReativar, el.botaoSalvar, el.botaoCancelarEdicao]
      .forEach(b => { b.disabled = ocupado; });
  }

  function definirOcupado(valor) {
    ocupado = valor;
    atualizarBotoes();
  }

  // ---------- Simulador ----------

  function agendarSimulacao(atraso = 350) {
    clearTimeout(temporizadorSimulacao);
    temporizadorSimulacao = setTimeout(simular, atraso);
  }

  async function simular() {
    const minha = ++requisicaoSimulacao;
    const texto = el.simuladorQuantidade.value;
    const quantidade = Number(texto);
    if (texto === "" || !(quantidade > 0)) {
      el.simuladorResultado.innerHTML = '<div class="simulacao-vazia">Informe uma quantidade para ver o consumo de insumos.</div>';
      return;
    }
    if (Math.abs(quantidade * 1000 - Math.round(quantidade * 1000)) > 1e-6) {
      el.simuladorResultado.innerHTML = '<div class="simulacao-vazia">Use no máximo 3 casas decimais.</div>';
      return;
    }
    try {
      const sim = await receitaService.simular(receita.id, texto);
      if (minha !== requisicaoSimulacao) return;
      renderizarSimulacao(el.simuladorResultado, sim);
    } catch (erro) {
      if (minha !== requisicaoSimulacao) return;
      el.simuladorResultado.innerHTML = `<div class="simulacao-vazia">${escaparHtml(erro.message || "Não foi possível simular.")}</div>`;
    }
  }

  el.simuladorQuantidade.addEventListener("input", () => agendarSimulacao());

  // ---------- Ações ----------

  async function recarregar() {
    try {
      receita = await receitaService.buscarPorId(receita.id);
      await carregarOrdensAbertas();
      renderizarReceita();
    } catch (erro) {
      toast.erro(erro.message);
    }
  }

  async function carregarOrdensAbertas() {
    try {
      const abertas = await ordemProducaoService.listar({ status: "aberta", produtoId: receita.produto_id });
      ordensAbertas = abertas.filter(o => o.receita_id === receita.id).length;
    } catch (erro) {
      ordensAbertas = null;   // só enriquece a tela
    }
  }

  function produzir() {
    window.location.href = `ordem-producao-nova.html?receita=${receita.id}`;
  }

  async function desativar() {
    if (ocupado) return;
    const aviso = ordensAbertas === 1
      ? "Há 1 ordem aberta com esta receita; ela não poderá ser confirmada enquanto a receita estiver inativa."
      : ordensAbertas > 1
        ? `Há ${ordensAbertas} ordens abertas com esta receita; elas não poderão ser confirmadas enquanto a receita estiver inativa.`
        : "Enquanto estiver inativa, não será possível criar nem confirmar ordens de produção com ela.";
    const confirmou = await confirmarAcao({
      titulo: `Desativar a receita de ${receita.produto_nome}?`,
      mensagem: `${aviso} Você pode reativá-la depois.`,
      textoConfirmar: "Desativar receita",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!confirmou) return;
    definirOcupado(true);
    try {
      await receitaService.desativar(receita.id);
      receita = await receitaService.buscarPorId(receita.id);
      renderizarReceita();
      definirOcupado(false);
      toast.sucesso("Receita desativada.");
    } catch (erro) {
      toast.erro(erro.message);
      await recarregar();
      definirOcupado(false);
    }
  }

  async function reativar() {
    if (ocupado) return;
    definirOcupado(true);
    try {
      receita = await receitaService.reativar(receita.id);
      renderizarReceita();
      definirOcupado(false);
      toast.sucesso("Receita reativada.");
    } catch (erro) {
      toast.erro(erro.message);
      definirOcupado(false);
    }
  }

  // ---------- Edição ----------

  async function entrarEdicao() {
    if (ocupado || modoEdicao) return;
    definirOcupado(true);
    el.edicao.querySelector("#receita-form").innerHTML = "";
    formulario = criarFormularioReceita(el.edicao.querySelector("#receita-form"), { modo: "editar", receita });
    try {
      await formulario.pronto;
    } catch (erro) {
      formulario = null;
      definirOcupado(false);
      return;   // o formulário já avisou o erro de carga
    }
    modoEdicao = true;
    el.faixaAviso.textContent = ordensAbertas === 1
      ? "Há 1 ordem aberta com esta receita: ao salvar, o consumo previsto dela passa a seguir a nova receita."
      : ordensAbertas > 1
        ? `Há ${ordensAbertas} ordens abertas com esta receita: ao salvar, o consumo previsto delas passa a seguir a nova receita.`
        : "";
    el.faixaAviso.hidden = !ordensAbertas;
    definirOcupado(false);
    formulario.focar();
  }

  async function sairEdicao({ pedirConfirmacao = true } = {}) {
    if (pedirConfirmacao && formulario && formulario.alterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi alterado ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return false;
    }
    modoEdicao = false;
    formulario = null;
    renderizarReceita();
    return true;
  }

  async function salvar() {
    if (salvando || !modoEdicao) return;
    const problema = formulario.validar();
    if (problema) {
      toast.erro(problema.mensagem);
      if (problema.foco && problema.foco.focus) problema.foco.focus();
      return;
    }
    salvando = true;
    el.botaoSalvar.disabled = true;
    el.botaoSalvar.textContent = "Salvando...";
    try {
      receita = await receitaService.atualizar(receita.id, formulario.montarPayload());
      modoEdicao = false;
      formulario = null;
      salvando = false;
      el.botaoSalvar.textContent = "Salvar alterações";
      renderizarReceita();
      toast.sucesso("Receita atualizada.");
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      el.botaoSalvar.disabled = false;
      el.botaoSalvar.textContent = "Salvar alterações";
    }
  }

  el.botaoProduzir.addEventListener("click", produzir);
  el.botaoEditar.addEventListener("click", entrarEdicao);
  el.botaoDesativar.addEventListener("click", desativar);
  el.botaoReativar.addEventListener("click", reativar);
  el.botaoSalvar.addEventListener("click", salvar);
  el.botaoCancelarEdicao.addEventListener("click", () => sairEdicao());
  el.edicao.addEventListener("submit", (e) => e.preventDefault());

  el.linkVoltar.addEventListener("click", async (evento) => {
    if (modoEdicao && formulario && formulario.alterado()) {
      evento.preventDefault();
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi alterado ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (descartar) { saindo = true; window.location.href = "producao.html?aba=receitas"; }
    }
  });

  window.addEventListener("beforeunload", (evento) => {
    if (modoEdicao && !saindo && !salvando && formulario && formulario.alterado()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  // ---------- Carga ----------

  if (!Number.isInteger(receitaId) || receitaId <= 0) {
    mostrarErroDePagina("Receita não informada.");
    toast.erro("Receita não informada.");
    return;
  }

  try {
    receita = await receitaService.buscarPorId(receitaId);
  } catch (erro) {
    mostrarErroDePagina(erro.status === 404 ? "Receita não encontrada." : "Não foi possível carregar a receita.");
    toast.erro(erro.message);
    return;
  }

  await carregarOrdensAbertas();
  renderizarReceita();

  if (recemCriada) {
    toast.sucesso(`Receita de ${receita.produto_nome} criada.`);
    history.replaceState(null, "", `receita-detalhe.html?id=${receita.id}`);
  }
});
