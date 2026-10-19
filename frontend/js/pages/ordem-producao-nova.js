// Nova Ordem de Produção.
// A ordem nasce ABERTA e não reserva estoque: a conferência de insumos aqui é só uma simulação
// (GET /receitas/{id}/simulacao) e não bloqueia a criação. O consumo real acontece ao confirmar.
// ?receita=ID abre com a receita já escolhida (vem do botão "Produzir" da receita).

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("producao.editar")) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("form-ordem"), botaoSalvar: $("botao-salvar"), botaoCancelar: $("botao-cancelar"), linkVoltar: $("link-voltar"),
    grupoReceita: $("grupo-receita"), receita: $("campo-receita"), dicaReceita: $("dica-receita"),
    grupoQuantidade: $("grupo-quantidade"), quantidade: $("campo-quantidade"), sigla: $("sigla-quantidade"),
    erroQuantidade: $("erro-quantidade"), dicaRendimento: $("dica-rendimento"),
    observacao: $("campo-observacao"), contador: $("contador-observacao"), simulacao: $("simulacao")
  };

  const MENSAGEM_VAZIA = '<div class="simulacao-vazia">Escolha a receita e a quantidade para ver o consumo de insumos.</div>';

  let receitas = [];
  let salvando = false;
  let saindo = false;
  let requisicaoSimulacao = 0;
  let temporizadorSimulacao = null;
  let instantaneoInicial = "";

  const receitaEscolhida = () => receitas.find(r => String(r.id) === el.receita.value) || null;
  const instantaneo = () => JSON.stringify([el.receita.value, el.quantidade.value, el.observacao.value.trim()]);

  function casasDecimaisOk(valor, casas) {
    const fator = 10 ** casas;
    return Math.abs(valor * fator - Math.round(valor * fator)) < 1e-6;
  }

  // ---------- Simulação ----------

  async function simular() {
    const minha = ++requisicaoSimulacao;
    const receita = receitaEscolhida();
    const texto = el.quantidade.value;
    const quantidade = Number(texto);
    if (!receita || texto === "" || !(quantidade > 0) || !casasDecimaisOk(quantidade, 3)) {
      el.simulacao.innerHTML = MENSAGEM_VAZIA;
      return;
    }
    try {
      const sim = await receitaService.simular(receita.id, texto);
      if (minha !== requisicaoSimulacao) return;
      renderizarSimulacao(el.simulacao, sim);
    } catch (erro) {
      if (minha !== requisicaoSimulacao) return;
      el.simulacao.innerHTML = `<div class="simulacao-vazia">${escaparHtml(erro.message || "Não foi possível simular o consumo.")}</div>`;
    }
  }

  function agendarSimulacao(atraso = 350) {
    clearTimeout(temporizadorSimulacao);
    temporizadorSimulacao = setTimeout(simular, atraso);
  }

  function atualizarDicas() {
    const r = receitaEscolhida();
    el.sigla.textContent = r && r.unidade_sigla ? r.unidade_sigla : "";
    el.dicaRendimento.textContent = r
      ? `A receita rende ${formatarNumero(r.rendimento)}${r.unidade_sigla ? " " + r.unidade_sigla : ""} por vez; qualquer quantidade é aceita.`
      : "";
  }

  // ---------- Eventos ----------

  el.receita.addEventListener("change", () => {
    el.grupoReceita.classList.remove("invalido");
    atualizarDicas();
    agendarSimulacao(0);
  });
  el.quantidade.addEventListener("input", () => {
    el.grupoQuantidade.classList.remove("invalido");
    agendarSimulacao();
  });
  el.observacao.addEventListener("input", () => {
    el.contador.textContent = `${el.observacao.value.length}/255`;
  });

  function validar() {
    let primeiro = null;
    const registrar = (mensagem, foco) => { if (!primeiro) primeiro = { mensagem, foco }; };

    el.grupoReceita.classList.toggle("invalido", !el.receita.value);
    if (!el.receita.value) registrar("Selecione a receita.", el.receita);

    const quantidade = Number(el.quantidade.value);
    let erro = "";
    if (el.quantidade.value === "" || !(quantidade > 0)) erro = "Informe uma quantidade maior que zero.";
    else if (!casasDecimaisOk(quantidade, 3)) erro = "A quantidade aceita no máximo 3 casas decimais.";
    el.grupoQuantidade.classList.toggle("invalido", Boolean(erro));
    if (erro) {
      el.erroQuantidade.textContent = erro;
      registrar(erro, el.quantidade);
    }
    return primeiro;
  }

  async function salvar() {
    if (salvando) return;
    const problema = validar();
    if (problema) {
      toast.erro(problema.mensagem);
      problema.foco.focus();
      return;
    }
    salvando = true;
    el.botaoSalvar.disabled = true;
    el.botaoSalvar.textContent = "Criando...";
    try {
      const criada = await ordemProducaoService.criar({
        receita_id: Number(el.receita.value),
        quantidade: Number(el.quantidade.value),
        observacao: el.observacao.value.trim() || null
      });
      saindo = true;
      window.location.href = `ordem-producao-detalhe.html?id=${criada.id}&novo=1`;
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      el.botaoSalvar.disabled = false;
      el.botaoSalvar.textContent = "Criar Ordem";
    }
  }

  async function sair(evento) {
    if (evento) evento.preventDefault();
    if (instantaneo() !== instantaneoInicial) {
      const descartar = await confirmarAcao({
        titulo: "Descartar esta ordem?",
        mensagem: "Os dados preenchidos ainda não foram salvos e serão perdidos.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    saindo = true;
    window.location.href = "producao.html";
  }

  el.form.addEventListener("submit", (e) => e.preventDefault());
  el.botaoSalvar.addEventListener("click", salvar);
  el.botaoCancelar.addEventListener("click", sair);
  el.linkVoltar.addEventListener("click", sair);
  window.addEventListener("beforeunload", (evento) => {
    if (!saindo && !salvando && instantaneo() !== instantaneoInicial) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  // ---------- Carga ----------

  try {
    receitas = (await receitaService.listar())
      .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR"));
  } catch (erro) {
    el.receita.innerHTML = '<option value="">Falha ao carregar</option>';
    toast.erro(`Não foi possível carregar as receitas. ${erro.message}`);
    return;
  }

  if (receitas.length === 0) {
    el.receita.innerHTML = '<option value="">Nenhuma receita ativa</option>';
    el.dicaReceita.innerHTML = 'Cadastre uma receita em <a class="link-pedido" href="receita-nova.html">Nova receita</a> para poder produzir.';
    return;
  }

  el.receita.innerHTML = '<option value="">Selecione...</option>' +
    receitas.map(r => `<option value="${r.id}">${escaparHtml(r.produto_nome)}${r.unidade_sigla ? " (" + escaparHtml(r.unidade_sigla) + ")" : ""}</option>`).join("");
  el.receita.disabled = false;
  el.botaoSalvar.disabled = false;

  const receitaInicial = new URLSearchParams(window.location.search).get("receita");
  if (receitaInicial && receitas.some(r => String(r.id) === receitaInicial)) {
    el.receita.value = receitaInicial;
    atualizarDicas();
    el.quantidade.focus();
  } else {
    el.receita.focus();
  }
  instantaneoInicial = instantaneo();
});
