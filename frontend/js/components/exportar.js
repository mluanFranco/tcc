// Botão "Exportar" (PDF / Excel) das listagens. Fica ao lado do botão principal do topo da página.
//   exportador.montar({
//     modulo: "pedidos-venda",               // usado no nome do arquivo e, por padrão, na rota /exportacao/{modulo}
//     formatos: ["pdf", "xlsx"],             // o financeiro usa só ["xlsx"]
//     obterIds: () => [...],                 // ids das linhas visíveis, NA ORDEM DA TELA
//     obterFiltros: () => [["Situação", "Abertos"], ["Busca", ""]],   // pares vazios são ignorados
//     obterAba: () => "ordens",              // opcional (produção)
//     baixar: (formato) => Promise<Blob>,    // opcional: troca a chamada padrão (financeiro)
//     aoEscolher: (formato) => {},           // opcional: em vez de baixar, faz outra coisa (geladeiras abre o modal de filtros)
//     nota: "..."                            // opcional: texto no rodapé do menu
//   })
// Depende de: api.js (apiFetchBlob), feedback.js (toast), exportacaoService.js.

const exportador = (() => {
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const OPCOES = {
    pdf: { texto: "PDF", detalhe: "Abre em uma nova aba", icone: '<span class="exportar__tag exportar__tag--pdf">PDF</span>' },
    xlsx: { texto: "Excel (.xlsx)", detalhe: "Baixa a planilha", icone: '<span class="exportar__tag exportar__tag--xlsx">XLS</span>' }
  };

  const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function salvarArquivo(url, nome) {
    const link = Object.assign(document.createElement("a"), { href: url, download: nome });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Coloca o botão principal (#botao-incluir) e o de exportar lado a lado no topo
  function areaDeAcoes() {
    const topo = document.querySelector(".pagina-topo");
    let area = topo.querySelector(".pagina-topo__acoes");
    if (!area) {
      area = document.createElement("div");
      area.className = "pagina-topo__acoes";
      const principal = topo.querySelector("#botao-incluir");
      if (principal) { principal.replaceWith(area); area.appendChild(principal); } else topo.appendChild(area);
    }
    return area;
  }

  function montar(cfg) {
    const formatos = cfg.formatos || ["pdf", "xlsx"];
    const raiz = document.createElement("div");
    raiz.className = "exportar";
    raiz.innerHTML = `
      <button type="button" class="botao-secundario exportar__botao" aria-haspopup="menu" aria-expanded="false">${ICONE}<span>Exportar</span>${SETA}</button>
      <div class="exportar__menu" role="menu" hidden>
        ${formatos.map(f => `<button type="button" class="exportar__opcao" role="menuitem" data-formato="${f}">
          ${OPCOES[f].icone}<span><strong>${OPCOES[f].texto}</strong><small>${OPCOES[f].detalhe}</small></span></button>`).join("")}
        <p class="exportar__nota">${cfg.nota || "Sai exatamente o que está na lista, com os filtros aplicados."}</p>
      </div>`;
    areaDeAcoes().prepend(raiz);

    const botao = raiz.querySelector(".exportar__botao");
    const menu = raiz.querySelector(".exportar__menu");
    const abrir = (sim) => { menu.hidden = !sim; botao.setAttribute("aria-expanded", String(sim)); };
    botao.addEventListener("click", () => abrir(menu.hidden));
    document.addEventListener("click", (e) => { if (!raiz.contains(e.target)) abrir(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { abrir(false); botao.focus(); } });

    menu.addEventListener("click", async (e) => {
      const opcao = e.target.closest("[data-formato]");
      if (!opcao) return;
      abrir(false);
      const formato = opcao.dataset.formato;
      if (cfg.aoEscolher) { cfg.aoEscolher(formato); return; }
      let pedido;
      if (cfg.baixar) {
        pedido = () => cfg.baixar(formato);
      } else {
        const ids = cfg.obterIds();
        if (!ids.length) { toast.erro("A lista está vazia: não há o que exportar com esses filtros."); return; }
        const filtros = (cfg.obterFiltros ? cfg.obterFiltros() : [])
          .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
          .map(([r, v]) => [r, String(v).trim()]);
        pedido = () => exportacaoService.listagem(cfg.modulo, formato, { ids, filtros, aba: cfg.obterAba ? cfg.obterAba() : null });
      }
      // PDF: a aba é aberta já no clique (antes da espera pela API), senão o navegador a trata como pop-up
      const aba = formato === "pdf" ? window.open("", "_blank") : null;
      botao.disabled = true;
      botao.querySelector("span").textContent = "Gerando...";
      try {
        const blob = await pedido();
        const url = URL.createObjectURL(blob);
        const nome = `${cfg.modulo}-${hoje()}.${formato}`;
        if (aba) aba.location.href = url;
        else salvarArquivo(url, nome);
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
        if (formato === "xlsx") toast.sucesso("Planilha gerada. Confira a pasta de downloads.");
      } catch (erro) {
        if (aba) aba.close();
        toast.erro(erro.message);
      } finally {
        botao.disabled = false;
        botao.querySelector("span").textContent = "Exportar";
      }
    });
    return raiz;
  }

  // Ajudantes para descrever filtros a partir da tela
  // Nome da aba ativa, sem o contador ("Ativos 52" -> "Ativos")
  const textoAbaAtiva = (seletor) => {
    const a = document.querySelector(`${seletor}.aba-status--ativa, ${seletor}.aba-secundaria--ativa`);
    if (!a) return "";
    const proprio = [...a.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(" ").trim();
    return proprio || a.textContent.trim();
  };
  const textoSelect = (sel) => (sel && sel.value ? sel.options[sel.selectedIndex].textContent.trim() : "");
  const periodo = (ini, fim) => {
    const br = (v) => v ? v.split("-").reverse().join("/") : "";
    return ini.value || fim.value ? `${br(ini.value) || "..."} a ${br(fim.value) || "..."}` : "";
  };

  return { montar, textoAbaAtiva, textoSelect, periodo };
})();
