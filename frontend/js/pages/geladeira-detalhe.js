// Detalhe da geladeira: dados, endereço de instalação e histórico de manutenção.
// Ações (com geladeiras.editar): editar, enviar para manutenção / voltar para campo, desativar / reativar,
// registrar e excluir manutenção. A situação (status) vem sempre da API; a tela nunca a deduz sozinha.
// Manutenção com custo vira um título a pagar (o backend cria junto); o histórico mostra a situação dessa despesa.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("geladeiras.ver")) return;
  const podeEditar = temPermissao("geladeiras.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    estado: $("estado-pagina"), conteudo: $("conteudo-geladeira"),
    titulo: $("titulo-pagina"), pilula: $("pilula-status"),
    botaoEditar: $("botao-editar"), botaoManutencao: $("botao-manutencao"), botaoCampo: $("botao-campo"),
    botaoDesativar: $("botao-desativar"), botaoReativar: $("botao-reativar"), aviso: $("aviso-geladeira"),
    cliente: $("vis-cliente"), tipo: $("vis-tipo"), serie: $("vis-serie"), marca: $("vis-marca"), modelo: $("vis-modelo"),
    alocacao: $("vis-alocacao"), endereco: $("vis-endereco"),
    botaoNovaManut: $("botao-nova-manutencao"), resumo: $("resumo-manutencao"),
    manutCorpo: $("manutencoes-corpo"), manutCarregando: $("manutencoes-carregando"), manutVazio: $("manutencoes-vazio"),
    // modal de manutenção
    modal: $("modal-manutencao"), form: $("form-manutencao"), mFechar: $("manut-fechar"), mCancelar: $("manut-cancelar"), mSalvar: $("manut-salvar"),
    mTipo: $("manut-tipo"), mData: $("manut-data"), mDescricao: $("manut-descricao"), mCusto: $("manut-custo"), mContador: $("manut-contador"),
    mDespesa: $("manut-bloco-despesa"), mFornecedor: $("manut-fornecedor"), mVencimento: $("manut-vencimento"),
    mGrupos: { tipo: $("manut-grupo-tipo"), data: $("manut-grupo-data"), descricao: $("manut-grupo-descricao"), custo: $("manut-grupo-custo"),
               fornecedor: $("manut-grupo-fornecedor"), vencimento: $("manut-grupo-vencimento") },
    mErros: { tipo: $("manut-erro-tipo"), data: $("manut-erro-data"), descricao: $("manut-erro-descricao"), custo: $("manut-erro-custo"),
              fornecedor: $("manut-erro-fornecedor"), vencimento: $("manut-erro-vencimento") }
  };

  const ROTULO_STATUS = { em_campo: "Em campo", manutencao: "Em manutenção", desativada: "Desativada" };
  const LIMITE_CUSTO = 9999999.99;

  let geladeira = null;
  let manutencoes = [];
  let ocupado = false;
  let enviandoManut = false;
  let instantaneoManut = "";

  const id = Number(new URLSearchParams(location.search).get("id"));

  function mostrarErroPagina(texto) {
    el.conteudo.hidden = true;
    el.estado.hidden = false;
    el.estado.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = texto;
    const voltar = document.createElement("a");
    voltar.href = "geladeiras.html";
    voltar.textContent = "Voltar para Geladeiras";
    voltar.className = "celula-link";
    el.estado.append(p, voltar);
  }

  function hojeIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- Cabeçalho e dados ----------
  function definirOcupado(valor) {
    ocupado = valor;
    [el.botaoEditar, el.botaoManutencao, el.botaoCampo, el.botaoDesativar, el.botaoReativar].forEach(b => { b.disabled = valor; });
    el.manutCorpo.querySelectorAll("button").forEach(b => { b.disabled = valor; });
  }

  function renderizarGeladeira() {
    const g = geladeira;
    const desativada = g.status === "desativada";
    el.titulo.textContent = g.numero_serie ? `Geladeira nº ${g.numero_serie}` : `Geladeira #${g.id}`;
    document.title = `${el.titulo.textContent} — Nova Sorvetes`;
    el.pilula.textContent = ROTULO_STATUS[g.status] ?? g.status;
    el.pilula.className = `pilula-status pilula-status--gel-${g.status}`;

    el.cliente.textContent = g.cliente_nome || `Cliente #${g.cliente_id}`;
    el.tipo.textContent = g.tipo || "—";
    el.serie.textContent = g.numero_serie || "—";
    el.marca.textContent = g.marca || "—";
    el.modelo.textContent = g.modelo || "—";
    el.alocacao.textContent = formatarData(g.data_alocacao);
    el.endereco.textContent = g.endereco ? formatarEndereco(g.endereco) : "Não informado";

    el.botaoEditar.hidden = !podeEditar || desativada;
    el.botaoManutencao.hidden = !podeEditar || g.status !== "em_campo";
    el.botaoCampo.hidden = !podeEditar || g.status !== "manutencao";
    el.botaoDesativar.hidden = !podeEditar || desativada;
    el.botaoReativar.hidden = !podeEditar || !desativada;
    el.botaoNovaManut.hidden = !podeEditar || desativada;

    let aviso = "";
    if (desativada) aviso = "Esta geladeira está desativada: não aceita novos registros de manutenção. O histórico continua disponível para consulta.";
    else if (!g.endereco_id) aviso = "Esta geladeira foi cadastrada sem endereço de instalação." + (podeEditar ? " Use Editar para informar onde ela está." : "");
    else if (g.endereco && g.endereco.ativo === false) aviso = "O endereço de instalação foi desativado no cadastro do cliente." + (podeEditar ? " Use Editar para escolher outro, se ela mudou de lugar." : "");
    el.aviso.textContent = aviso;
    el.aviso.hidden = !aviso;
  }

  async function recarregarGeladeira() {
    geladeira = await geladeiraService.buscarPorId(id);
    renderizarGeladeira();
    renderizarManutencoes();   // os botões de excluir dependem da situação
  }

  // ---------- Histórico de manutenção ----------
  function renderizarManutencoes() {
    el.manutCarregando.hidden = true;
    const vazio = manutencoes.length === 0;
    el.manutVazio.hidden = !vazio;
    el.resumo.hidden = vazio;
    if (vazio) { el.manutCorpo.innerHTML = ""; return; }

    const centavos = manutencoes.reduce((s, m) => s + Math.round(Number(m.custo || 0) * 100), 0);
    el.resumo.innerHTML = `<span><strong>${manutencoes.length}</strong> ${manutencoes.length === 1 ? "registro" : "registros"}</span><span>Total gasto: <strong>${escaparHtml(formatarMoeda(centavos / 100))}</strong></span>`;

    el.manutCorpo.innerHTML = manutencoes.map(m => {
      const tipo = m.tipo === "preventiva" ? "Preventiva" : "Corretiva";
      const excluir = podeEditar ? `
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" data-id="${m.id}" title="Excluir registro" aria-label="Excluir registro de ${escaparHtml(formatarData(m.data))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
        </button>` : "";
      return `
        <tr>
          <td class="celula-data">${escaparHtml(formatarData(m.data))}</td>
          <td><span class="badge-tipo-manut badge-tipo-manut--${m.tipo === "preventiva" ? "preventiva" : "corretiva"}">${tipo}</span></td>
          <td class="celula-descricao">${m.descricao ? escaparHtml(m.descricao) : "—"}</td>
          <td class="celula-numero">${escaparHtml(formatarMoeda(m.custo || 0))}</td>
          <td>${despesaHtml(m)}</td>
          <td>${escaparHtml(m.usuario_nome || "—")}</td>
          <td class="celula-acoes">${excluir}</td>
        </tr>`;
    }).join("");
  }

  // Situação do título a pagar gerado pelo custo; com financeiro.ver vira link para o título.
  function despesaHtml(m) {
    if (!m.titulo_id) return '<span class="despesa-manut despesa-manut--sem">—</span>';
    const situacao = {
      aberto: { classe: "aberto", texto: `A pagar · vence ${formatarData(m.titulo_vencimento)}` },
      parcial: { classe: "parcial", texto: "Paga em parte" },
      pago: { classe: "pago", texto: "Paga" },
      cancelado: { classe: "cancelado", texto: "Cancelada" }
    }[m.titulo_status] || { classe: "aberto", texto: m.titulo_status || "—" };
    const vencida = m.titulo_status === "aberto" && m.titulo_vencimento && m.titulo_vencimento < hojeIso();
    const texto = vencida ? `Vencida em ${formatarData(m.titulo_vencimento)}` : situacao.texto;
    const badge = `<span class="despesa-manut despesa-manut--${vencida ? "vencida" : situacao.classe}">${escaparHtml(texto)}</span>`;
    const fornecedor = m.fornecedor_nome ? `<span class="despesa-manut__fornecedor">${escaparHtml(m.fornecedor_nome)}</span>` : "";
    const conteudo = badge + fornecedor;
    return temPermissao("financeiro.ver")
      ? `<a class="despesa-manut__link" href="titulo-detalhe.html?id=${m.titulo_id}" title="Abrir a conta a pagar">${conteudo}</a>`
      : conteudo;
  }

  async function carregarManutencoes() {
    try {
      manutencoes = await historicoManutencaoService.listar({ geladeiraId: id });
      renderizarManutencoes();
    } catch (erro) {
      el.manutCarregando.hidden = true;
      el.manutCorpo.innerHTML = "";
      el.resumo.hidden = true;
      el.manutVazio.hidden = false;
      el.manutVazio.textContent = "Não foi possível carregar o histórico de manutenção.";
      toast.erro(erro.message);
    }
  }

  el.manutCorpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao='excluir']");
    if (!botao || ocupado) return;
    const registro = manutencoes.find(m => m.id === Number(botao.dataset.id));
    if (!registro) return;
    const temDespesa = registro.titulo_id && registro.titulo_status !== "cancelado";
    const confirmou = await confirmarAcao({
      titulo: "Excluir registro de manutenção?",
      mensagem: `O registro de ${formatarData(registro.data)} (${formatarMoeda(registro.custo || 0)}) será apagado de vez. Não dá para desfazer.` +
        (temDespesa ? " A conta a pagar desta manutenção será cancelada no Financeiro (se já houver pagamento, estorne-o antes)." : ""),
      textoConfirmar: "Excluir",
      perigo: true
    });
    if (!confirmou) return;
    definirOcupado(true);
    try {
      await historicoManutencaoService.excluir(registro.id);
      toast.sucesso("Registro excluído.");
      await carregarManutencoes();
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      definirOcupado(false);
    }
  });

  // ---------- Ações da geladeira ----------
  async function executar(acao, mensagemSucesso) {
    definirOcupado(true);
    try {
      await acao();
      toast.sucesso(mensagemSucesso);
      await recarregarGeladeira();
    } catch (erro) {
      toast.erro(erro.message);
      try { await recarregarGeladeira(); } catch (_) { /* mantém a tela como está */ }
    } finally {
      definirOcupado(false);
    }
  }

  el.botaoEditar.addEventListener("click", () => {
    if (ocupado) return;
    geladeiraForm.abrir({ geladeira, aoSalvar: recarregarGeladeira });
  });

  el.botaoManutencao.addEventListener("click", async () => {
    if (ocupado) return;
    const ok = await confirmarAcao({
      titulo: "Enviar para manutenção?",
      mensagem: "A geladeira passa para \"Em manutenção\". Quando o conserto terminar, use \"Voltar para campo\".",
      textoConfirmar: "Enviar para manutenção"
    });
    if (ok) executar(() => geladeiraService.alterarStatus(id, "manutencao"), "Geladeira enviada para manutenção.");
  });

  el.botaoCampo.addEventListener("click", () => {
    if (ocupado) return;
    executar(() => geladeiraService.alterarStatus(id, "em_campo"), "Geladeira de volta ao campo.");
  });

  el.botaoDesativar.addEventListener("click", async () => {
    if (ocupado) return;
    const ok = await confirmarAcao({
      titulo: "Desativar geladeira?",
      mensagem: "Ela sairá da lista principal e deixará de aceitar registros de manutenção. O histórico é mantido e você pode reativá-la depois.",
      textoConfirmar: "Desativar",
      perigo: true
    });
    if (ok) executar(() => geladeiraService.desativar(id), "Geladeira desativada.");
  });

  el.botaoReativar.addEventListener("click", () => {
    if (ocupado) return;
    executar(() => geladeiraService.reativar(id), "Geladeira reativada. Ela voltou para \"Em campo\".");
  });

  // ---------- Modal: registrar manutenção ----------
  aplicarMascaraMoeda(el.mCusto);

  const instantaneoDoModal = () => JSON.stringify([el.mTipo.value, el.mData.value, el.mDescricao.value, el.mCusto.value,
                                                   el.mFornecedor.value, el.mVencimento.value]);
  let vencimentoEditado = false;     // enquanto não mexerem nele, o vencimento acompanha a data da manutenção
  let fornecedoresCarregados = false;

  async function carregarFornecedores() {
    if (fornecedoresCarregados) return;
    try {
      const lista = (await fornecedorService.listar()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      el.mFornecedor.innerHTML = '<option value="">Sem fornecedor</option>' +
        lista.map(f => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");
      fornecedoresCarregados = true;
    } catch (_) { /* sem a lista, a despesa vai sem fornecedor */ }
  }

  function atualizarBlocoDespesa() {
    const custo = el.mCusto.value ? moedaParaNumero(el.mCusto.value) : 0;
    el.mDespesa.hidden = !(custo > 0);
    if (!vencimentoEditado) el.mVencimento.value = el.mData.value;
  }
  const modalAlterado = () => instantaneoDoModal() !== instantaneoManut;

  function limparErroManut(campo) {
    el.mGrupos[campo].classList.remove("invalido");
    el.mErros[campo].textContent = "";
  }
  function erroManut(campo, msg) {
    el.mGrupos[campo].classList.add("invalido");
    el.mErros[campo].textContent = msg;
  }
  function definirEnviandoManut(valor) {
    enviandoManut = valor;
    el.mSalvar.disabled = valor;
    el.mSalvar.textContent = valor ? "Salvando..." : "Salvar";
  }

  function abrirModalManut() {
    if (ocupado || el.modal.classList.contains("aberto")) return;
    el.form.reset();
    Object.keys(el.mGrupos).forEach(limparErroManut);
    el.mData.max = hojeIso();
    el.mData.value = hojeIso();
    el.mContador.textContent = "0/500";
    vencimentoEditado = false;
    atualizarBlocoDespesa();
    carregarFornecedores();
    definirEnviandoManut(false);
    instantaneoManut = instantaneoDoModal();
    el.modal.classList.add("aberto");
    el.mTipo.focus();
  }

  function fecharModalManut() {
    el.modal.classList.remove("aberto");
  }

  async function tentarFecharManut() {
    if (enviandoManut) return;
    if (modalAlterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar alterações?",
        mensagem: "O que você preencheu neste registro será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    fecharModalManut();
  }

  function validarManut() {
    Object.keys(el.mGrupos).forEach(limparErroManut);
    let primeiro = null;
    const falha = (campo, msg, foco) => { erroManut(campo, msg); if (!primeiro) primeiro = foco; };
    if (!el.mData.value || !/^\d{4}-\d{2}-\d{2}$/.test(el.mData.value) || Number(el.mData.value.slice(0, 4)) < 2000) falha("data", "Informe a data da manutenção.", el.mData);
    else if (el.mData.value > hojeIso()) falha("data", "A data não pode ser no futuro.", el.mData);
    const custo = el.mCusto.value ? moedaParaNumero(el.mCusto.value) : 0;
    if (custo === null || custo < 0) falha("custo", "Informe um custo válido.", el.mCusto);
    else if (custo > LIMITE_CUSTO) falha("custo", "O custo máximo é R$ 9.999.999,99.", el.mCusto);
    if (el.mDescricao.value.trim().length > 500) falha("descricao", "A descrição pode ter no máximo 500 caracteres.", el.mDescricao);
    if (custo > 0 && (!el.mVencimento.value || Number(el.mVencimento.value.slice(0, 4)) < 2000)) {
      falha("vencimento", "Informe quando a despesa vence.", el.mVencimento);
    }
    if (primeiro) primeiro.focus();
    return primeiro ? null : custo;
  }

  async function salvarManutencao(evento) {
    evento.preventDefault();
    if (enviandoManut) return;
    const custo = validarManut();
    if (custo === null) return;
    definirEnviandoManut(true);
    try {
      await historicoManutencaoService.criar({
        geladeira_id: id,
        tipo: el.mTipo.value,
        data: el.mData.value,
        descricao: el.mDescricao.value.trim() || null,
        custo,
        fornecedor_id: custo > 0 && el.mFornecedor.value ? Number(el.mFornecedor.value) : null,
        vencimento: custo > 0 ? el.mVencimento.value : null
      });
      fecharModalManut();
      definirEnviandoManut(false);
      toast.sucesso(custo > 0 ? "Manutenção registrada e conta a pagar lançada no Financeiro." : "Manutenção registrada.");
      await carregarManutencoes();
    } catch (erro) {
      definirEnviandoManut(false);
      toast.erro(erro.message);
      if (/desativada/i.test(erro.message)) { fecharModalManut(); try { await recarregarGeladeira(); } catch (_) { /* segue */ } }
    }
  }

  el.botaoNovaManut.addEventListener("click", abrirModalManut);
  el.mFechar.addEventListener("click", tentarFecharManut);
  el.mCancelar.addEventListener("click", tentarFecharManut);
  el.modal.addEventListener("mousedown", (e) => { if (e.target === el.modal) tentarFecharManut(); });
  el.form.addEventListener("submit", salvarManutencao);
  el.mDescricao.addEventListener("input", () => { el.mContador.textContent = `${el.mDescricao.value.length}/500`; limparErroManut("descricao"); });
  el.mData.addEventListener("input", () => { limparErroManut("data"); atualizarBlocoDespesa(); });
  el.mCusto.addEventListener("input", () => { limparErroManut("custo"); atualizarBlocoDespesa(); });
  el.mVencimento.addEventListener("input", () => { vencimentoEditado = true; limparErroManut("vencimento"); });
  el.mFornecedor.addEventListener("change", () => limparErroManut("fornecedor"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.modal.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) tentarFecharManut();
  });
  window.addEventListener("beforeunload", (e) => {
    if (el.modal.classList.contains("aberto") && modalAlterado()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------- Início ----------
  if (!Number.isInteger(id) || id <= 0) { mostrarErroPagina("Geladeira inválida."); return; }
  try {
    geladeira = await geladeiraService.buscarPorId(id);
  } catch (erro) {
    mostrarErroPagina(erro.status === 404 ? "Geladeira não encontrada." : erro.message);
    return;
  }
  el.estado.hidden = true;
  el.conteudo.hidden = false;
  renderizarGeladeira();
  await carregarManutencoes();
});
