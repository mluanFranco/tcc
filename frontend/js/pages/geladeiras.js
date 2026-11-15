// Geladeiras: lista com abas por situação (Todas / Em campo / Em manutenção / Desativadas), busca e ações rápidas.
// O cadastro/edição usa o modal compartilhado (geladeira-form.js); o histórico de manutenção fica no detalhe.
// Permissões: geladeiras.ver abre a tela e o relatório PDF; geladeiras.editar mostra Incluir, Editar, Desativar e Reativar.

const ROTULO_STATUS_GELADEIRA = { em_campo: "Em campo", manutencao: "Em manutenção", desativada: "Desativada" };

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("geladeiras.ver")) return;
  const podeEditar = temPermissao("geladeiras.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    corpo: $("tabela-geladeiras-corpo"), vazio: $("estado-vazio"), carregando: $("estado-carregando"),
    busca: $("campo-busca"), botaoIncluir: $("botao-incluir"), abas: document.querySelectorAll(".aba-status[data-aba]")
  };

  let abaAtual = "todas";
  let grupoCarregado = null;     // "ativas" (em campo + manutenção) ou "desativadas"
  let cache = [];
  let requisicaoAtual = 0;       // descarta respostas antigas se o usuário trocar de aba rápido
  let ocupado = false;

  el.botaoIncluir.hidden = !podeEditar;

  const ICONE_VER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const ICONE_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const ICONE_DESATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  const ICONE_REATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

  const nomeDaGeladeira = (g) => g.numero_serie ? `nº ${g.numero_serie}` : `#${g.id}`;

  function mostrarVazio(texto) {
    el.corpo.innerHTML = "";
    el.vazio.textContent = texto;
    el.vazio.hidden = false;
  }

  function visiveis() {
    const termo = el.busca.value.trim().toLowerCase();
    return cache.filter(g => {
      if ((abaAtual === "em_campo" || abaAtual === "manutencao") && g.status !== abaAtual) return false;
      if (!termo) return true;
      return [g.numero_serie, g.modelo, g.marca, g.tipo, g.cliente_nome].some(v => (v || "").toLowerCase().includes(termo));
    });
  }

  function linhaCliente(g) {
    const e = g.endereco;
    const sub = !g.endereco_id
      ? '<span class="celula-dupla__sub celula-dupla__sub--alerta">Sem endereço de instalação</span>'
      : (e && (e.cidade || e.uf) ? `<span class="celula-dupla__sub">${escaparHtml([e.cidade, e.uf].filter(Boolean).join("/"))}</span>` : "");
    return `<span class="celula-dupla__principal">${escaparHtml(g.cliente_nome || `Cliente #${g.cliente_id}`)}</span>${sub}`;
  }

  function renderizar() {
    el.carregando.hidden = true;
    const lista = visiveis();
    if (lista.length === 0) {
      const filtrando = el.busca.value.trim() !== "" || cache.length > 0;
      mostrarVazio(filtrando ? "Nenhuma geladeira encontrada com esses filtros." : "Nenhuma geladeira cadastrada.");
      return;
    }
    el.vazio.hidden = true;

    el.corpo.innerHTML = lista.map(g => {
      const nome = escaparHtml(nomeDaGeladeira(g));
      const marcaModelo = [g.marca, g.modelo].filter(Boolean).join(" ");
      const desativada = g.status === "desativada";
      const editar = podeEditar && !desativada ? `
        <button type="button" class="botao-icone" data-acao="editar" data-id="${g.id}" title="Editar" aria-label="Editar geladeira ${nome}">${ICONE_EDITAR}</button>` : "";
      const estado = !podeEditar ? "" : (desativada
        ? `<button type="button" class="botao-icone" data-acao="reativar" data-id="${g.id}" title="Reativar" aria-label="Reativar geladeira ${nome}">${ICONE_REATIVAR}</button>`
        : `<button type="button" class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${g.id}" title="Desativar" aria-label="Desativar geladeira ${nome}">${ICONE_DESATIVAR}</button>`);
      return `
        <tr>
          <td class="celula-nome"><a class="celula-link" href="geladeira-detalhe.html?id=${g.id}">${g.numero_serie ? escaparHtml(g.numero_serie) : `<span class="celula-dupla__sub">Sem nº de série (#${g.id})</span>`}</a></td>
          <td><span class="celula-dupla__principal">${escaparHtml(g.tipo)}</span>${marcaModelo ? `<span class="celula-dupla__sub">${escaparHtml(marcaModelo)}</span>` : ""}</td>
          <td>${linhaCliente(g)}</td>
          <td>${escaparHtml(formatarData(g.data_alocacao))}</td>
          <td><span class="badge-status badge-status--gel-${escaparHtml(g.status)}">${escaparHtml(ROTULO_STATUS_GELADEIRA[g.status] ?? g.status)}</span></td>
          <td class="celula-acoes">
            <a class="botao-icone" href="geladeira-detalhe.html?id=${g.id}" title="Ver detalhes" aria-label="Ver detalhes da geladeira ${nome}">${ICONE_VER}</a>
            ${editar}
            ${estado}
          </td>
        </tr>`;
    }).join("");
  }

  async function carregar(forcar = false) {
    const grupo = abaAtual === "desativadas" ? "desativadas" : "ativas";
    if (!forcar && grupo === grupoCarregado) { renderizar(); return; }
    const minha = ++requisicaoAtual;
    el.corpo.innerHTML = "";
    el.vazio.hidden = true;
    el.carregando.hidden = false;
    try {
      const dados = grupo === "desativadas" ? await geladeiraService.listarDesativadas() : await geladeiraService.listar();
      if (minha !== requisicaoAtual) return;
      cache = dados;
      grupoCarregado = grupo;
      renderizar();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      cache = [];
      grupoCarregado = null;
      el.carregando.hidden = true;
      mostrarVazio("Não foi possível carregar as geladeiras.");
      toast.erro(erro.message);
    }
  }

  function trocarAba(nova) {
    abaAtual = nova;
    el.abas.forEach(b => {
      const ativa = b.dataset.aba === nova;
      b.classList.toggle("aba-status--ativa", ativa);
      b.setAttribute("aria-selected", String(ativa));
    });
    carregar();
  }

  el.abas.forEach(b => b.addEventListener("click", () => trocarAba(b.dataset.aba)));
  el.busca.addEventListener("input", () => { if (grupoCarregado) renderizar(); });
  el.botaoIncluir.addEventListener("click", () => geladeiraForm.abrir({ aoSalvar: () => carregar(true) }));

  el.corpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao || ocupado) return;
    const geladeira = cache.find(g => g.id === Number(botao.dataset.id));
    if (!geladeira) return;
    const acao = botao.dataset.acao;

    if (acao === "editar") {
      geladeiraForm.abrir({ geladeira, aoSalvar: () => carregar(true) });
      return;
    }

    if (acao === "desativar") {
      const confirmou = await confirmarAcao({
        titulo: "Desativar geladeira?",
        mensagem: `A geladeira ${nomeDaGeladeira(geladeira)} sairá da lista principal e deixará de aceitar registros de manutenção. O histórico é mantido e você pode reativá-la depois.`,
        textoConfirmar: "Desativar",
        perigo: true
      });
      if (!confirmou) return;
    }

    ocupado = true;
    try {
      if (acao === "desativar") await geladeiraService.desativar(geladeira.id);
      else await geladeiraService.reativar(geladeira.id);
      toast.sucesso(acao === "desativar" ? "Geladeira desativada." : "Geladeira reativada. Ela voltou para \"Em campo\".");
      await carregar(true);
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      ocupado = false;
    }
  });

  // ---------- Relatório de patrimônio (PDF) ----------
  const rel = {
    overlay: $("modal-relatorio"), form: $("rel-form"), status: $("rel-status"), inicio: $("rel-inicio"), fim: $("rel-fim"),
    erro: $("rel-erro-periodo"), grupoFim: $("rel-grupo-fim"), gerar: $("rel-gerar"), gerarExcel: $("rel-gerar-excel")
  };
  const isoHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  function abrirRelatorio(formato = "pdf") {
    const excel = formato === "xlsx";
    $("rel-titulo").textContent = excel ? "Relatório de geladeiras — Excel" : "Relatório de geladeiras — PDF";
    rel.gerar.hidden = excel;
    rel.gerarExcel.hidden = !excel;
    rel.gerarExcel.classList.toggle("botao-primario", excel);
    rel.gerarExcel.classList.toggle("botao-secundario", !excel);
    // começa com a situação da aba atual e o ano corrente
    rel.status.value = { em_campo: "em_campo", manutencao: "manutencao", desativadas: "desativada" }[abaAtual] || "";
    rel.fim.value = isoHoje();
    rel.inicio.value = `${rel.fim.value.slice(0, 4)}-01-01`;
    rel.erro.textContent = "";
    rel.grupoFim.classList.remove("invalido");
    rel.gerar.disabled = false;
    rel.gerar.textContent = "Gerar PDF";
    rel.gerarExcel.disabled = false;
    rel.gerarExcel.textContent = "Gerar Excel";
    rel.overlay.classList.add("aberto");
    rel.status.focus();
    rel.formatoAtual = formato;
  }
  const fecharRelatorio = () => rel.overlay.classList.remove("aberto");

  function periodoDoRelatorioValido() {
    if (rel.inicio.value && rel.fim.value && rel.inicio.value > rel.fim.value) {
      rel.grupoFim.classList.add("invalido");
      rel.erro.textContent = "A data final não pode ser antes da inicial.";
      rel.fim.focus();
      return false;
    }
    return true;
  }

  // Excel: baixa a planilha (geladeiras + manutenções do período)
  rel.gerarExcel.addEventListener("click", async () => {
    if (!periodoDoRelatorioValido()) return;
    rel.gerarExcel.disabled = true;
    rel.gerarExcel.textContent = "Gerando...";
    try {
      const blob = await geladeiraService.baixarRelatorioExcel({ status: rel.status.value, dataInicio: rel.inicio.value, dataFim: rel.fim.value });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: `relatorio-geladeiras-${isoHoje()}.xlsx` });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      toast.sucesso("Planilha gerada. Confira a pasta de downloads.");
      fecharRelatorio();
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      rel.gerarExcel.disabled = false;
      rel.gerarExcel.textContent = "Gerar Excel";
    }
  });

  rel.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (rel.formatoAtual === "xlsx") { rel.gerarExcel.click(); return; }
    if (!periodoDoRelatorioValido()) return;
    // A aba é aberta já no clique (antes da espera pela API), senão o navegador a trata como pop-up.
    const aba = window.open("", "_blank");
    rel.gerar.disabled = true;
    rel.gerar.textContent = "Gerando...";
    try {
      const blob = await geladeiraService.baixarRelatorioPdf({ status: rel.status.value, dataInicio: rel.inicio.value, dataFim: rel.fim.value });
      const url = URL.createObjectURL(blob);
      if (aba) aba.location.href = url;
      else {
        const link = Object.assign(document.createElement("a"), { href: url, download: `relatorio-geladeiras-${isoHoje()}.pdf` });
        document.body.appendChild(link); link.click(); link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      fecharRelatorio();
    } catch (erro) {
      if (aba) aba.close();
      toast.erro(erro.message);
    } finally {
      rel.gerar.disabled = false;
      rel.gerar.textContent = "Gerar PDF";
    }
  });
  [rel.inicio, rel.fim].forEach(c => c.addEventListener("input", () => { rel.grupoFim.classList.remove("invalido"); rel.erro.textContent = ""; }));
  // Mesmo botão "Exportar" das outras telas; aqui ele abre o modal de filtros do relatório de patrimônio
  exportador.montar({
    modulo: "geladeiras",
    aoEscolher: abrirRelatorio,
    nota: "Escolha a situação e o período das manutenções na próxima tela."
  });
  $("rel-fechar").addEventListener("click", fecharRelatorio);
  $("rel-cancelar").addEventListener("click", fecharRelatorio);
  rel.overlay.addEventListener("mousedown", (e) => { if (e.target === rel.overlay) fecharRelatorio(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && rel.overlay.classList.contains("aberto")) fecharRelatorio(); });

  carregar(true);
});
