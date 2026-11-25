// Auditoria Nova IA (só administrador): o que o assistente acionou, para quem, com que resultado e em quanto tempo.
//
// Regras que a tela espelha do backend:
//  - toda pergunta tem pelo menos uma linha (assistente_log): uma por ferramenta acionada, "resposta direta" quando a IA
//    respondeu sem ferramenta, ou a falha; a resposta da IA vem resumida (resposta_resumo, ~300 caracteres, sem SQL);
//  - "Barradas pelas travas" = bloqueios do código (garantidos); "Recusadas pela IA" = recusas que a própria IA declarou
//    por registrar_recusa (status recusa_*; sinal para o admin, não trava); "Tentativas indevidas" = recusa_indevida;
//  - os cartões usam o resumo do período e ignoram o filtro de "Resultado"; clicar em um cartão aplica esse filtro;
//  - "status" aceita vários valores separados por vírgula (Barradas = sql_recusado + sem_permissao);
//  - datas são o dia do servidor (America/Sao_Paulo), o mesmo relógio que grava o horário do registro; "Até" é inclusivo.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAdmin()) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    corpo: $("tabela-corpo"), vazio: $("estado-vazio"), carregando: $("estado-carregando"),
    usuario: $("filtro-usuario"), status: $("filtro-status"), ferramenta: $("filtro-ferramenta"),
    inicio: $("filtro-inicio"), fim: $("filtro-fim"), limpar: $("botao-limpar"), erroFiltro: $("erro-filtro"),
    paginacao: $("paginacao"), paginacaoTexto: $("paginacao-texto"), anterior: $("botao-anterior"), proxima: $("botao-proxima"),
    painel: $("painel"), painelOverlay: $("painel-overlay"), painelCorpo: $("painel-corpo"), painelFechar: $("painel-fechar"),
    kpiTotal: $("kpi-total"), kpiOk: $("kpi-ok"), kpiBarradas: $("kpi-barradas"), kpiErros: $("kpi-erros"),
    kpiDuracao: $("kpi-duracao"), kpiUsuarios: $("kpi-usuarios"),
    kpiRecusadas: $("kpi-recusadas"), kpiIndevidas: $("kpi-indevidas")
  };
  const cartoes = [...document.querySelectorAll(".aud-cartao[data-filtro]")];

  const LIMITE = 25;
  const ROTULO_STATUS = {
    ok: "Concluída", sql_recusado: "SQL recusado", sem_permissao: "Sem permissão",
    erro_execucao: "Erro na execução", erro_ferramenta: "Erro na ferramenta", erro_provedor: "Erro do provedor",
    erro_interno: "Erro interno", sem_consulta: "Respondida sem consulta",
    recusa_permissao: "Recusada: sem permissão", recusa_acao: "Recusada: ação não permitida",
    recusa_indevida: "Recusada: tentativa indevida", recusa_escopo: "Recusada: fora do escopo"
  };
  const CLASSE_STATUS = {
    ok: "ok", sql_recusado: "alerta", sem_permissao: "alerta",
    erro_execucao: "erro", erro_ferramenta: "erro", erro_provedor: "erro", erro_interno: "erro",
    sem_consulta: "neutro", recusa_permissao: "alerta", recusa_acao: "alerta", recusa_escopo: "alerta", recusa_indevida: "erro"
  };
  const ROTULO_FERRAMENTA = {
    consultar_banco: "Consulta ao banco", relatorio_financeiro: "Relatório financeiro", como_usar: "Ajuda de uso",
    registrar_recusa: "Registro de recusa", resposta_direta: "Resposta direta", provedor: "Provedor de IA", sistema: "Sistema"
  };
  const NOTA_STATUS = {
    sem_consulta: "A IA respondeu sem acessar dados e sem declarar recusa (ex.: explicação, conversa). Se a resposta for uma recusa, "
      + "a IA não a declarou: a segurança dos dados não depende disso, pois toda consulta passa pelas travas do sistema.",
    recusa_indevida: "A própria IA identificou o pedido como tentativa indevida (burlar o sistema, obter senhas, mudar as regras da IA). "
      + "É um sinal para o administrador acompanhar o usuário; o bloqueio dos dados é garantido pelas travas do sistema."
  };

  let itens = [];
  let total = 0;
  let offset = 0;
  let requisicao = 0;
  let ultimoFoco = null;

  // ---------- Filtros ----------
  function filtros() {
    return {
      usuarioId: el.usuario.value, ferramenta: el.ferramenta.value,
      dataInicio: el.inicio.value, dataFim: el.fim.value
    };
  }

  function periodoValido() {
    const invalido = el.inicio.value && el.fim.value && el.inicio.value > el.fim.value;
    el.erroFiltro.hidden = !invalido;
    el.erroFiltro.textContent = invalido ? "A data inicial não pode ser depois da data final." : "";
    return !invalido;
  }

  function marcarCartao() {
    cartoes.forEach(c => {
      const ativo = c.dataset.filtro === el.status.value;
      c.classList.toggle("aud-cartao--ativo", ativo);
      c.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
  }

  // ---------- Resumo ----------
  async function carregarResumo(minha) {
    try {
      const r = await auditoriaIaService.resumo(filtros());
      if (minha !== requisicao) return;
      el.kpiOk.textContent = String(r.por_status.ok || 0);
      el.kpiBarradas.textContent = String(r.recusados);
      el.kpiErros.textContent = String(r.erros);
      el.kpiRecusadas.textContent = String(r.recusadas_ia || 0);
      el.kpiIndevidas.textContent = String(r.tentativas_indevidas || 0);
      el.kpiDuracao.textContent = r.duracao_media_ms === null ? "—" : formatarDuracao(r.duracao_media_ms);
      el.kpiUsuarios.textContent = String(r.usuarios);
      el.kpiTotal.textContent = String(r.total);
    } catch (e) {
      if (minha !== requisicao || e.status === 401) return;
      [el.kpiTotal, el.kpiOk, el.kpiBarradas, el.kpiErros, el.kpiDuracao, el.kpiUsuarios, el.kpiRecusadas, el.kpiIndevidas].forEach(k => { k.textContent = "—"; });
    }
  }

  function formatarDuracao(ms) {
    if (ms === null || ms === undefined) return "—";
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  }

  // ---------- Lista ----------
  function badge(status) {
    const rotulo = ROTULO_STATUS[status] || status;
    return `<span class="aud-badge aud-badge--${CLASSE_STATUS[status] || "neutro"}">${escaparHtml(rotulo)}</span>`;
  }

  function desenharLista() {
    el.corpo.innerHTML = itens.map((l, i) => `
      <tr class="linha-clicavel" data-indice="${i}" tabindex="0" aria-label="Ver detalhe do registro ${l.id}">
        <td class="aud-nowrap">${escaparHtml(formatarDataHora(l.created_at))}</td>
        <td>${escaparHtml(l.usuario_nome || "—")}</td>
        <td class="aud-pergunta" title="${escaparHtml(l.pergunta || "")}">${l.pergunta ? escaparHtml(l.pergunta) : '<span class="aud-vazio">—</span>'}</td>
        <td class="aud-pergunta" title="${escaparHtml(l.resposta_resumo || "")}">${l.resposta_resumo ? escaparHtml(l.resposta_resumo) : '<span class="aud-vazio">—</span>'}</td>
        <td class="aud-nowrap">${escaparHtml(ROTULO_FERRAMENTA[l.ferramenta] || l.ferramenta)}</td>
        <td>${badge(l.status)}</td>
        <td class="aud-num">${l.linhas === null || l.linhas === undefined ? "—" : l.linhas}</td>
        <td class="aud-num aud-nowrap">${formatarDuracao(l.duracao_ms)}</td>
      </tr>`).join("");
  }

  function desenharPaginacao() {
    const de = total === 0 ? 0 : offset + 1;
    const ate = Math.min(offset + itens.length, total);
    el.paginacao.hidden = total <= LIMITE && offset === 0;
    el.paginacaoTexto.textContent = `Mostrando ${de}–${ate} de ${total}`;
    el.anterior.disabled = offset === 0;
    el.proxima.disabled = offset + LIMITE >= total;
  }

  async function carregarLista(minha) {
    el.carregando.hidden = false;
    el.vazio.hidden = true;
    try {
      const r = await auditoriaIaService.listar({ ...filtros(), status: el.status.value, limite: LIMITE, offset });
      if (minha !== requisicao) return;
      // Se a última página esvaziou (filtro mudou), volta para a anterior.
      if (r.itens.length === 0 && r.total > 0 && offset > 0) {
        offset = Math.max(0, Math.floor((r.total - 1) / LIMITE) * LIMITE);
        return carregarLista(minha);
      }
      itens = r.itens; total = r.total;
      el.carregando.hidden = true;
      desenharLista();
      desenharPaginacao();
      const vazio = itens.length === 0;
      el.vazio.hidden = !vazio;
      if (vazio) {
        const filtrado = el.usuario.value || el.status.value || el.ferramenta.value || el.inicio.value || el.fim.value;
        el.vazio.textContent = filtrado ? "Nenhum registro encontrado com esses filtros." : "Ainda não há registros: nada foi perguntado ao assistente.";
        el.paginacao.hidden = true;
      }
    } catch (e) {
      if (minha !== requisicao || e.status === 401) return;
      el.carregando.hidden = true;
      itens = []; total = 0;
      desenharLista();
      el.paginacao.hidden = true;
      el.vazio.hidden = false;
      el.vazio.textContent = "Não foi possível carregar a auditoria.";
      toast.erro(e.message);
    }
  }

  function recarregar({ voltarAoInicio = true } = {}) {
    if (!periodoValido()) return;
    if (voltarAoInicio) offset = 0;
    marcarCartao();
    const minha = ++requisicao;
    carregarResumo(minha);
    carregarLista(minha);
  }

  // ---------- Painel de detalhe ----------
  function campo(rotulo, valor) {
    return `<div class="aud-detalhe__campo"><span class="aud-detalhe__rotulo">${rotulo}</span><div class="aud-detalhe__valor">${valor}</div></div>`;
  }

  function dataCompleta(iso) {
    const d = new Date(String(iso));
    return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR");
  }

  function abrirPainel(l) {
    ultimoFoco = document.activeElement;
    const bloco = (texto) => `<pre class="aud-codigo">${escaparHtml(texto)}</pre>`;
    const recusa = l.ferramenta === "registrar_recusa";
    const nota = NOTA_STATUS[l.status];
    el.painelCorpo.innerHTML = [
      campo("Resultado", badge(l.status) + (nota ? `<p class="aud-texto aud-nota">${escaparHtml(nota)}</p>` : "")),
      campo("Usuário", escaparHtml(l.usuario_nome || "—")),
      campo("Data e hora", escaparHtml(dataCompleta(l.created_at))),
      campo("Ferramenta", escaparHtml(ROTULO_FERRAMENTA[l.ferramenta] || l.ferramenta)),
      campo("Pergunta do usuário", l.pergunta ? `<p class="aud-texto">${escaparHtml(l.pergunta)}</p>` : '<span class="aud-vazio">Não registrada</span>'),
      campo("Resposta da IA (resumo)", l.resposta_resumo ? `<p class="aud-texto">${escaparHtml(l.resposta_resumo)}</p>`
        : `<span class="aud-vazio">${l.status.startsWith("erro") ? "Sem resposta: a pergunta falhou" : "—"}</span>`),
      recusa
        ? campo("Motivo declarado pela IA", l.erro ? `<p class="aud-texto">${escaparHtml(l.erro)}</p>` : '<span class="aud-vazio">—</span>')
        : campo(l.ferramenta === "consultar_banco" ? "SQL executado" : "Entrada da ferramenta", l.entrada ? bloco(l.entrada) : '<span class="aud-vazio">—</span>'),
      recusa ? "" : campo("Views consultadas", l.views ? escaparHtml(l.views) : '<span class="aud-vazio">—</span>'),
      recusa ? "" : campo("Linhas devolvidas", l.linhas === null || l.linhas === undefined ? "—" : String(l.linhas)),
      campo("Duração", formatarDuracao(l.duracao_ms)),
      l.erro && !recusa ? campo("Motivo / erro", `<p class="aud-texto aud-texto--erro">${escaparHtml(l.erro)}</p>`) : ""
    ].join("");
    el.painelOverlay.hidden = false;
    el.painel.hidden = false;
    requestAnimationFrame(() => { el.painel.classList.add("aud-painel--aberto"); el.painelFechar.focus(); });
  }

  function fecharPainel() {
    if (el.painel.hidden) return;
    el.painel.classList.remove("aud-painel--aberto");
    el.painel.hidden = true;
    el.painelOverlay.hidden = true;
    if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus();
  }

  // ---------- Eventos ----------
  el.corpo.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr[data-indice]");
    if (tr) abrirPainel(itens[Number(tr.dataset.indice)]);
  });
  el.corpo.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const tr = ev.target.closest("tr[data-indice]");
    if (tr) { ev.preventDefault(); abrirPainel(itens[Number(tr.dataset.indice)]); }
  });
  el.painelFechar.addEventListener("click", fecharPainel);
  el.painelOverlay.addEventListener("click", fecharPainel);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharPainel(); });

  [el.usuario, el.status, el.ferramenta, el.inicio, el.fim].forEach(c => c.addEventListener("change", () => recarregar()));
  cartoes.forEach(c => c.addEventListener("click", () => {
    el.status.value = c.dataset.filtro;
    recarregar();
  }));
  el.limpar.addEventListener("click", () => {
    el.usuario.value = el.status.value = el.ferramenta.value = el.inicio.value = el.fim.value = "";
    recarregar();
  });
  el.anterior.addEventListener("click", () => { offset = Math.max(0, offset - LIMITE); recarregar({ voltarAoInicio: false }); });
  el.proxima.addEventListener("click", () => { offset += LIMITE; recarregar({ voltarAoInicio: false }); });
  $("form-filtros").addEventListener("submit", (ev) => ev.preventDefault());

  // ---------- Início ----------
  try {
    const usuarios = await usuarioService.listar({ incluirInativos: true });
    usuarios.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach(u => el.usuario.add(new Option(u.ativo === false ? `${u.nome} (inativo)` : u.nome, u.id)));
  } catch (e) {
    if (e.status !== 401) toast.erro("Não foi possível carregar a lista de usuários para o filtro.");
  }
  recarregar();
});
