// Formas de Pagamento: lista, cadastro/edição com editor de parcelas e visualização com simulação.
//
// Uma forma de pagamento é um "molde" de parcelas: cada parcela tem um prazo em dias (contado da data base do
// pedido) e um percentual do total. Regras do backend que a tela respeita:
//  - de 1 a 24 parcelas; prazo de 0 a 3650 dias e sem diminuir de uma parcela para a seguinte;
//  - percentual maior que 0, no máximo 2 casas, e a soma tem de ser exatamente 100;
//  - descrição única (sem diferenciar maiúsculas) e taxa entre 0 e 100.
// O tipo (À vista / A prazo / Parcelado) é calculado pelo backend a partir das parcelas.
// Os percentuais são somados em centésimos inteiros para não ter erro de ponto flutuante.

let formasCache = [];
let abaAtivaForma = "ativos";
let formaEmEdicaoId = null;
let requisicaoAtual = 0;   // descarta respostas antigas se o usuário trocar de aba rápido

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const podeEditar = temPermissao("cadastros.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    tabelaCorpo: $("tabela-formas-corpo"), estadoVazio: $("estado-vazio"), estadoCarregando: $("estado-carregando"),
    campoBusca: $("campo-busca"), abaAtivos: $("aba-ativos"), abaInativos: $("aba-inativos"), botaoIncluir: $("botao-incluir"),
    // modal de edição
    modal: $("modal-forma"), modalTitulo: $("modal-titulo"), modalFechar: $("modal-fechar"), modalCancelar: $("modal-cancelar"),
    modalSalvar: $("modal-salvar"), form: $("form-forma"),
    grupoDescricao: $("grupo-descricao"), descricao: $("campo-descricao"), erroDescricao: $("erro-descricao"),
    grupoTaxa: $("grupo-taxa"), taxa: $("campo-taxa"), erroTaxa: $("erro-taxa"),
    botaoAdicionarParcela: $("botao-adicionar-parcela"), botaoGerar: $("botao-gerar-parcelas"),
    gerarQuantidade: $("gerar-quantidade"), gerarIntervalo: $("gerar-intervalo"), gerarPrimeira: $("gerar-primeira"),
    parcelasCorpo: $("parcelas-corpo"), soma: $("soma-parcelas"), avisoEdicao: $("aviso-edicao"),
    // modal de visualização
    modalVis: $("modal-visualizar-forma"), visFechar: $("modal-visualizar-fechar"), visFecharRodape: $("modal-visualizar-fechar-rodape"),
    visDescricao: $("vis-descricao"), visStatus: $("vis-status"), visTipo: $("vis-tipo"), visTaxa: $("vis-taxa"),
    visParcelasCorpo: $("vis-parcelas-corpo"), visSimularValor: $("vis-simular-valor"), visSimulacao: $("vis-simulacao")
  };

  const ROTULO_TIPO = { vista: "À vista", parcelado: "Parcelado", prazo: "A prazo" };
  const MAX_PARCELAS = 24;
  const MAX_PRAZO = 3650;

  el.botaoIncluir.hidden = !podeEditar;

  const textoDias = (n) => `${n} ${n === 1 ? "dia" : "dias"}`;
  const percentualTexto = (v) => `${Number(v).toFixed(2).replace(".", ",")}%`;
  const centesimos = (texto) => Math.round(Number(texto) * 100);

  // ---------- Resumo das parcelas (lista e visualização) ----------

  function resumoDasParcelas(forma) {
    const p = forma.parcelas;
    if (forma.tipo === "vista") return "À vista";
    if (p.length === 1) return textoDias(p[0].prazo_dias);
    return `${p.length}x — ${p.map(x => x.prazo_dias).join("/")} dias`;
  }

  function detalheDasParcelas(forma) {
    return forma.parcelas.map(p => `${p.numero}ª: ${percentualTexto(p.percentual)} em ${textoDias(p.prazo_dias)}`).join(" · ");
  }

  // ---------- Lista ----------

  function mostrarVazio(texto) {
    el.tabelaCorpo.innerHTML = "";
    el.estadoVazio.textContent = texto;
    el.estadoVazio.hidden = false;
  }

  function renderizarTabela() {
    el.estadoCarregando.hidden = true;
    const termo = el.campoBusca.value.trim().toLowerCase();
    const filtradas = formasCache.filter(f => !termo || f.descricao.toLowerCase().includes(termo));

    if (filtradas.length === 0) {
      mostrarVazio(formasCache.length > 0 ? "Nenhuma forma de pagamento encontrada com essa busca." : "Nenhuma forma de pagamento encontrada.");
      return;
    }
    el.estadoVazio.hidden = true;

    el.tabelaCorpo.innerHTML = filtradas.map(forma => {
      const acaoStatus = !podeEditar ? "" : (forma.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${forma.id}" title="Desativar" aria-label="Desativar ${escaparHtml(forma.descricao)}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${forma.id}" title="Reativar" aria-label="Reativar ${escaparHtml(forma.descricao)}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`);
      const acaoEditar = !podeEditar ? "" : `
        <button class="botao-icone" data-acao="editar" data-id="${forma.id}" title="Editar" aria-label="Editar ${escaparHtml(forma.descricao)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>`;

      return `
        <tr>
          <td class="celula-nome">${escaparHtml(forma.descricao)}</td>
          <td><span class="badge-tipo-forma badge-tipo-forma--${escaparHtml(forma.tipo)}">${escaparHtml(ROTULO_TIPO[forma.tipo] ?? forma.tipo)}</span></td>
          <td class="celula-parcelas" title="${escaparHtml(detalheDasParcelas(forma))}">${escaparHtml(resumoDasParcelas(forma))}</td>
          <td class="celula-numero">${percentualTexto(forma.taxa_percentual)}</td>
          <td><span class="badge-status ${forma.ativo ? "badge-status--ativo" : "badge-status--inativo"}">${forma.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${forma.id}" title="Visualizar" aria-label="Visualizar ${escaparHtml(forma.descricao)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            ${acaoEditar}
            ${acaoStatus}
          </td>
        </tr>`;
    }).join("");
  }

  async function carregarFormas() {
    const minha = ++requisicaoAtual;
    el.tabelaCorpo.innerHTML = "";
    el.estadoVazio.hidden = true;
    el.estadoCarregando.hidden = false;
    try {
      const dados = abaAtivaForma === "ativos"
        ? await formaPagamentoService.listar()
        : await formaPagamentoService.listarInativos();
      if (minha !== requisicaoAtual) return;
      formasCache = dados;
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      formasCache = [];
      el.estadoCarregando.hidden = true;
      mostrarVazio("Não foi possível carregar as formas de pagamento.");
      toast.erro(erro.message);
    }
  }

  function trocarAba(novaAba) {
    abaAtivaForma = novaAba;
    el.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    el.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarFormas();
  }

  // ---------- Editor de parcelas ----------

  let parcelas = [];          // [{ uid, prazo, percentual }] (textos dos campos)
  let proximoUid = 1;
  let instantaneoInicial = "";

  const parcelaPorUid = (uid) => parcelas.find(p => p.uid === Number(uid));

  function instantaneo() {
    return JSON.stringify([el.descricao.value.trim(), el.taxa.value, parcelas.map(p => [p.prazo, p.percentual])]);
  }
  const alterado = () => instantaneo() !== instantaneoInicial;

  function criarLinha(parcela) {
    const tr = document.createElement("tr");
    tr.dataset.uid = parcela.uid;
    tr.innerHTML = `
      <td class="col-numero" data-numero></td>
      <td class="col-prazo">
        <input type="number" data-campo="prazo" min="0" max="${MAX_PRAZO}" step="1" inputmode="numeric" aria-label="Prazo em dias" value="${escaparHtml(parcela.prazo)}">
        <span class="parcela-aviso" hidden></span>
      </td>
      <td class="col-perc">
        <input type="number" data-campo="percentual" min="0" max="100" step="0.01" inputmode="decimal" aria-label="Percentual da parcela" value="${escaparHtml(parcela.percentual)}">
      </td>
      <td class="col-dados" data-descricao></td>
      <td class="col-acao">
        <button type="button" class="botao-lixeira" data-remover aria-label="Remover parcela">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>`;
    return tr;
  }

  function descricaoDaLinha(parcela) {
    const prazo = parcela.prazo === "" ? null : Number(parcela.prazo);
    if (prazo === null || isNaN(prazo)) return "—";
    return prazo === 0 ? "No ato" : `${textoDias(prazo)} após a data base`;
  }

  function atualizarSoma() {
    const total = parcelas.reduce((s, p) => s + (isNaN(centesimos(p.percentual)) || p.percentual === "" ? 0 : centesimos(p.percentual)), 0);
    const diferenca = 10000 - total;
    el.soma.classList.toggle("soma-parcelas--ok", diferenca === 0 && parcelas.length > 0);
    el.soma.classList.toggle("soma-parcelas--erro", diferenca !== 0 && parcelas.length > 0);
    let aviso = "";
    if (parcelas.length === 0) aviso = "Adicione ao menos uma parcela.";
    else if (diferenca === 0) aviso = "Fecha 100%";
    else if (diferenca > 0) aviso = `Faltam ${percentualTexto(diferenca / 100)}`;
    else aviso = `Passou ${percentualTexto(-diferenca / 100)}`;
    el.soma.innerHTML = `<span>Soma dos percentuais: ${percentualTexto(total / 100)}</span><span>${escaparHtml(aviso)}</span>`;
  }

  // Atualiza o que depende do número da linha e dos valores (sem recriar os campos).
  function atualizarLinhas() {
    el.parcelasCorpo.querySelectorAll("tr[data-uid]").forEach((tr, indice) => {
      const parcela = parcelaPorUid(tr.dataset.uid);
      tr.querySelector("[data-numero]").textContent = `${indice + 1}ª`;
      tr.querySelector("[data-descricao]").textContent = descricaoDaLinha(parcela);
      tr.querySelector('[data-remover]').disabled = parcelas.length === 1;
    });
    atualizarSoma();
    el.botaoAdicionarParcela.disabled = parcelas.length >= MAX_PARCELAS;
  }

  function reconstruirLinhas() {
    el.parcelasCorpo.innerHTML = "";
    parcelas.forEach(p => el.parcelasCorpo.appendChild(criarLinha(p)));
    atualizarLinhas();
  }

  function adicionarParcela({ focar = true } = {}) {
    if (parcelas.length >= MAX_PARCELAS) return;
    const ultima = parcelas[parcelas.length - 1];
    const parcela = { uid: proximoUid++, prazo: ultima && ultima.prazo !== "" ? String(Number(ultima.prazo) + 30) : "0", percentual: "" };
    parcelas.push(parcela);
    const tr = criarLinha(parcela);
    el.parcelasCorpo.appendChild(tr);
    atualizarLinhas();
    if (focar) tr.querySelector('[data-campo="percentual"]').focus();
  }

  el.parcelasCorpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const tr = evento.target.closest("tr[data-uid]");
    if (!campo || !tr) return;
    const parcela = parcelaPorUid(tr.dataset.uid);
    parcela[campo] = evento.target.value;
    evento.target.classList.remove("campo-invalido");
    const aviso = tr.querySelector(".parcela-aviso");
    aviso.hidden = true;
    atualizarLinhas();
  });

  el.parcelasCorpo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao || botao.disabled) return;
    const tr = botao.closest("tr[data-uid]");
    parcelas = parcelas.filter(p => p.uid !== Number(tr.dataset.uid));
    tr.remove();
    atualizarLinhas();
  });

  el.botaoAdicionarParcela.addEventListener("click", () => adicionarParcela());

  // "Gerar parcelas": N parcelas iguais; o resto do centavo vai para a última (como o backend faz com os valores).
  function gerarParcelas() {
    const n = Number(el.gerarQuantidade.value);
    const intervalo = Number(el.gerarIntervalo.value);
    const primeira = Number(el.gerarPrimeira.value);
    const inteiro = (v) => Number.isInteger(v);

    let erro = "";
    if (!inteiro(n) || n < 1 || n > MAX_PARCELAS) erro = `Informe de 1 a ${MAX_PARCELAS} parcelas.`;
    else if (!inteiro(intervalo) || intervalo < 0 || intervalo > MAX_PRAZO) erro = `O intervalo deve ficar entre 0 e ${MAX_PRAZO} dias.`;
    else if (!inteiro(primeira) || primeira < 0 || primeira > MAX_PRAZO) erro = `O prazo da 1ª parcela deve ficar entre 0 e ${MAX_PRAZO} dias.`;
    else if (primeira + (n - 1) * intervalo > MAX_PRAZO) erro = `O prazo da última parcela passaria de ${MAX_PRAZO} dias.`;
    if (erro) { toast.erro(erro); return; }

    const base = Math.floor(10000 / n);
    parcelas = Array.from({ length: n }, (_, i) => ({
      uid: proximoUid++,
      prazo: String(primeira + i * intervalo),
      percentual: ((i === n - 1 ? 10000 - base * (n - 1) : base) / 100).toFixed(2)
    }));
    reconstruirLinhas();
  }

  el.botaoGerar.addEventListener("click", gerarParcelas);

  // ---------- Modal de edição ----------

  function limparErros() {
    [el.grupoDescricao, el.grupoTaxa].forEach(g => g.classList.remove("invalido"));
    el.parcelasCorpo.querySelectorAll(".campo-invalido").forEach(i => i.classList.remove("campo-invalido"));
    el.parcelasCorpo.querySelectorAll(".parcela-aviso").forEach(a => { a.hidden = true; });
  }

  function abrirModal(forma = null) {
    el.form.reset();
    limparErros();
    parcelas = [];
    proximoUid = 1;

    if (forma) {
      formaEmEdicaoId = forma.id;
      el.modalTitulo.textContent = "Editar forma de pagamento";
      el.descricao.value = forma.descricao;
      el.taxa.value = String(Number(forma.taxa_percentual));
      parcelas = forma.parcelas.slice().sort((a, b) => a.numero - b.numero).map(p => ({
        uid: proximoUid++, prazo: String(p.prazo_dias), percentual: Number(p.percentual).toFixed(2)
      }));
    } else {
      formaEmEdicaoId = null;
      el.modalTitulo.textContent = "Nova forma de pagamento";
      el.taxa.value = "0";
      parcelas = [{ uid: proximoUid++, prazo: "0", percentual: "100.00" }];   // começa como "À vista"
    }
    el.avisoEdicao.hidden = !forma;
    reconstruirLinhas();
    instantaneoInicial = instantaneo();
    el.modal.classList.add("aberto");
    el.descricao.focus();
  }

  function fecharModal() {
    el.modal.classList.remove("aberto");
    formaEmEdicaoId = null;
  }

  async function pedirParaFechar() {
    if (alterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi preenchido ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    fecharModal();
  }

  function validar() {
    limparErros();
    let primeiro = null;
    const registrar = (mensagem, foco) => { if (!primeiro) primeiro = { mensagem, foco }; };

    const descricao = el.descricao.value.trim();
    if (!descricao) {
      el.erroDescricao.textContent = "Informe a descrição.";
      el.grupoDescricao.classList.add("invalido");
      registrar("Informe a descrição.", el.descricao);
    } else if (descricao.length > 100) {
      el.erroDescricao.textContent = "A descrição aceita até 100 caracteres.";
      el.grupoDescricao.classList.add("invalido");
      registrar("A descrição aceita até 100 caracteres.", el.descricao);
    }

    const taxa = el.taxa.value === "" ? 0 : Number(el.taxa.value);
    if (isNaN(taxa) || taxa < 0 || taxa > 100) {
      el.grupoTaxa.classList.add("invalido");
      registrar("A taxa deve ficar entre 0 e 100.", el.taxa);
    }

    if (parcelas.length === 0) registrar("Adicione ao menos uma parcela.", el.botaoAdicionarParcela);

    let anterior = -1;
    parcelas.forEach((parcela, indice) => {
      const tr = el.parcelasCorpo.querySelector(`tr[data-uid="${parcela.uid}"]`);
      const prazo = Number(parcela.prazo);
      const perc = Number(parcela.percentual);
      let erro = "";
      let campo = null;

      if (parcela.prazo === "" || !Number.isInteger(prazo) || prazo < 0 || prazo > MAX_PRAZO) {
        erro = `Parcela ${indice + 1}: o prazo deve ser um número inteiro de 0 a ${MAX_PRAZO} dias.`; campo = "prazo";
      } else if (prazo < anterior) {
        erro = `Parcela ${indice + 1}: o prazo não pode ser menor que o da parcela anterior.`; campo = "prazo";
      } else if (parcela.percentual === "" || !(perc > 0) || perc > 100) {
        erro = `Parcela ${indice + 1}: o percentual deve ser maior que 0 e no máximo 100.`; campo = "percentual";
      } else if (Math.abs(perc * 100 - Math.round(perc * 100)) > 1e-6) {
        erro = `Parcela ${indice + 1}: o percentual aceita no máximo 2 casas decimais.`; campo = "percentual";
      }
      if (!erro) anterior = prazo;

      if (campo) {
        const input = tr.querySelector(`[data-campo="${campo}"]`);
        input.classList.add("campo-invalido");
        if (campo === "prazo") {
          const aviso = tr.querySelector(".parcela-aviso");
          aviso.textContent = erro.replace(/^Parcela \d+: /, "");
          aviso.hidden = false;
        }
        registrar(erro, input);
      }
    });

    if (parcelas.length > 0 && !primeiro) {
      const total = parcelas.reduce((s, p) => s + centesimos(p.percentual), 0);
      if (total !== 10000) registrar(`A soma dos percentuais deve ser exatamente 100% (hoje: ${percentualTexto(total / 100)}).`, el.parcelasCorpo.querySelector('[data-campo="percentual"]'));
    }
    return primeiro;
  }

  function montarPayload() {
    return {
      descricao: el.descricao.value.trim(),
      taxa_percentual: el.taxa.value === "" ? 0 : Number(el.taxa.value),
      parcelas: parcelas.map(p => ({ prazo_dias: Number(p.prazo), percentual: Number(p.percentual) }))
    };
  }

  async function salvarForma(evento) {
    evento.preventDefault();
    if (el.modalSalvar.disabled) return;
    const problema = validar();
    if (problema) {
      toast.erro(problema.mensagem);
      if (problema.foco && problema.foco.focus) problema.foco.focus();
      return;
    }

    const dados = montarPayload();
    const editando = formaEmEdicaoId !== null;
    el.modalSalvar.disabled = true;
    el.modalSalvar.textContent = "Salvando...";
    try {
      if (editando) await formaPagamentoService.atualizar(formaEmEdicaoId, dados);
      else await formaPagamentoService.criar(dados);
      fecharModal();
      toast.sucesso(`Forma de pagamento "${dados.descricao}" ${editando ? "atualizada" : "criada"}.`);
      if (!editando && abaAtivaForma !== "ativos") trocarAba("ativos"); else await carregarFormas();
    } catch (erro) {
      toast.erro(erro.message);   // ex.: descrição repetida; a modal fica aberta para corrigir
    } finally {
      el.modalSalvar.disabled = false;
      el.modalSalvar.textContent = "Salvar";
    }
  }

  // ---------- Modal de visualização (com simulação) ----------

  let formaVisualizada = null;
  let requisicaoSimulacao = 0;
  let temporizadorSimulacao = null;

  function abrirModalVisualizacao(forma) {
    formaVisualizada = forma;
    el.visDescricao.textContent = forma.descricao;
    el.visStatus.textContent = forma.ativo ? "Ativa" : "Inativa";
    el.visTipo.textContent = ROTULO_TIPO[forma.tipo] ?? forma.tipo;
    el.visTaxa.textContent = percentualTexto(forma.taxa_percentual);
    el.visParcelasCorpo.innerHTML = forma.parcelas.slice().sort((a, b) => a.numero - b.numero).map(p => `
      <tr>
        <td class="col-numero">${p.numero}ª</td>
        <td>${p.prazo_dias === 0 ? "No ato" : textoDias(p.prazo_dias)}</td>
        <td class="num">${percentualTexto(p.percentual)}</td>
      </tr>`).join("");
    el.visSimularValor.value = "1000.00";
    el.modalVis.classList.add("aberto");
    simular();
  }

  function fecharModalVisualizacao() {
    el.modalVis.classList.remove("aberto");
    formaVisualizada = null;
    requisicaoSimulacao++;
  }

  async function simular() {
    const minha = ++requisicaoSimulacao;
    const forma = formaVisualizada;
    if (!forma) return;
    const texto = el.visSimularValor.value;
    const valor = Number(texto);
    if (texto === "" || !(valor > 0) || Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6 || valor > 9999999999.99) {
      el.visSimulacao.innerHTML = '<div class="simulacao-vazia">Informe um valor maior que zero, com até 2 casas decimais.</div>';
      return;
    }
    try {
      const sim = await formaPagamentoService.simular(forma.id, valor);
      if (minha !== requisicaoSimulacao) return;
      const total = sim.parcelas.length;
      el.visSimulacao.innerHTML = `
        <table class="tabela-parcelas">
          <thead><tr><th class="col-numero">Parcela</th><th>Vencimento</th><th class="num">Percentual</th><th class="num">Valor</th></tr></thead>
          <tbody>${sim.parcelas.map(p => `
            <tr>
              <td class="col-numero">${total === 1 ? "À vista" : `${p.numero}/${total}`}</td>
              <td>${formatarData(p.vencimento)}</td>
              <td class="num">${percentualTexto(p.percentual)}</td>
              <td class="num"><strong>${formatarMoeda(p.valor)}</strong></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (erro) {
      if (minha !== requisicaoSimulacao) return;
      el.visSimulacao.innerHTML = `<div class="simulacao-vazia">${escaparHtml(erro.message || "Não foi possível simular.")}</div>`;
    }
  }

  el.visSimularValor.addEventListener("input", () => {
    clearTimeout(temporizadorSimulacao);
    temporizadorSimulacao = setTimeout(simular, 350);
  });

  // ---------- Ações da tabela ----------

  async function tratarAcaoTabela(evento) {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;
    const id = parseInt(botao.dataset.id, 10);
    const acao = botao.dataset.acao;
    const forma = formasCache.find(f => f.id === id);
    if (!forma) return;

    if (acao === "visualizar") abrirModalVisualizacao(forma);
    if (acao === "editar") abrirModal(forma);

    if (acao === "desativar") {
      const confirmou = await confirmarAcao({
        titulo: `Desativar "${forma.descricao}"?`,
        mensagem: "Ela deixa de aparecer nos novos pedidos e cotações. O que já foi criado com ela continua igual, e você pode reativá-la depois.",
        textoConfirmar: "Desativar",
        textoCancelar: "Voltar",
        perigo: true
      });
      if (!confirmou) return;
      try {
        await formaPagamentoService.desativar(id);
        toast.sucesso(`Forma de pagamento "${forma.descricao}" desativada.`);
      } catch (erro) {
        toast.erro(erro.message);
      }
      await carregarFormas();
    }

    if (acao === "reativar") {
      try {
        await formaPagamentoService.reativar(id);
        toast.sucesso(`Forma de pagamento "${forma.descricao}" reativada.`);
      } catch (erro) {
        toast.erro(erro.message);
      }
      await carregarFormas();
    }
  }

  // ---------- Eventos ----------

  el.botaoIncluir.addEventListener("click", () => abrirModal());
  el.modalFechar.addEventListener("click", pedirParaFechar);
  el.modalCancelar.addEventListener("click", pedirParaFechar);
  el.modal.addEventListener("click", (e) => { if (e.target === el.modal) pedirParaFechar(); });
  el.form.addEventListener("submit", salvarForma);
  el.campoBusca.addEventListener("input", renderizarTabela);
  el.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  el.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  el.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  el.visFechar.addEventListener("click", fecharModalVisualizacao);
  el.visFecharRodape.addEventListener("click", fecharModalVisualizacao);
  el.modalVis.addEventListener("click", (e) => { if (e.target === el.modalVis) fecharModalVisualizacao(); });

  window.addEventListener("beforeunload", (evento) => {
    if (el.modal.classList.contains("aberto") && alterado()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  await carregarFormas();
});
