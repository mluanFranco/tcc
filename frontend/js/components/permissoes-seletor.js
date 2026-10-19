// Seletor de permissões por módulo (checkboxes), usado em Grupos de Acesso e nas permissões extras de Usuários.
//
//   const seletor = permissoesSeletor.criar({ lista: elemento, contador: elemento, aoMudar: () => {...} });
//   seletor.definirCatalogo(catalogoDaApi);          // [{ modulo, descricao, permissoes: [{ codigo, acao }] }]
//   seletor.definir(["vendas.editar"], ["geladeiras.ver"]);   // marcadas pelo usuário, herdadas (marcadas e travadas)
//   seletor.obter();                                 // só as marcadas pelo usuário (as herdadas não entram), na ordem do catálogo
//
// Regra espelhada do backend: "editar" de um módulo já inclui "ver": ao marcar editar, o ver fica marcado e travado.
// Depende de formatadores.js (escaparHtml).

const ROTULO_MODULO_PERMISSAO = {
  cadastros: "Cadastros", geladeiras: "Geladeiras", vendas: "Vendas", compras: "Compras", cotacoes: "Cotações",
  producao: "Produção", financeiro: "Financeiro", relatorios: "Relatórios", assistente: "Assistente de IA"
};
const ROTULO_ACAO_PERMISSAO = { ver: "Visualizar", editar: "Criar e alterar" };

function rotuloModulo(modulo) {
  return ROTULO_MODULO_PERMISSAO[modulo] || (modulo.charAt(0).toUpperCase() + modulo.slice(1));
}

// ["vendas.ver", "vendas.editar", "geladeiras.ver"] -> ["Vendas", "Geladeiras (leitura)"]
function resumoModulos(codigos) {
  const porModulo = new Map();
  (codigos || []).forEach(c => {
    const [modulo, acao] = c.split(".");
    porModulo.set(modulo, (porModulo.get(modulo) || new Set()).add(acao));
  });
  return [...porModulo.entries()].map(([m, acoes]) => rotuloModulo(m) + (acoes.has("editar") || !acoes.has("ver") ? "" : " (leitura)"));
}

const permissoesSeletor = {
  criar({ lista, contador = null, textoContador = null, aoMudar = null }) {
    let catalogo = [];
    let selecionadas = new Set();
    let herdadas = new Set();
    let travado = false;

    const codigos = () => catalogo.flatMap(m => m.permissoes.map(p => p.codigo));
    const temEditar = (modulo) => selecionadas.has(`${modulo}.editar`) || herdadas.has(`${modulo}.editar`);

    function atualizarContador() {
      if (!contador) return;
      contador.textContent = textoContador
        ? textoContador(selecionadas.size, herdadas.size, codigos().length)
        : `${selecionadas.size} de ${codigos().length} selecionadas`;
    }

    function renderizar() {
      lista.innerHTML = catalogo.map(m => {
        const moduloTemEditar = m.permissoes.some(p => p.acao === "editar");
        const opcoes = m.permissoes.map(p => {
          const herdada = herdadas.has(p.codigo);
          const implicita = p.acao === "ver" && moduloTemEditar && temEditar(m.modulo);
          const marcada = herdada || selecionadas.has(p.codigo) || implicita;
          const desabilitada = travado || herdada || implicita;
          return `<label class="perm-opcao${desabilitada ? " perm-opcao--travada" : ""}">
              <input type="checkbox" data-codigo="${escaparHtml(p.codigo)}" ${marcada ? "checked" : ""} ${desabilitada ? "disabled" : ""}>
              <span>${escaparHtml(ROTULO_ACAO_PERMISSAO[p.acao] || p.acao)}</span>${herdada ? ' <span class="perm-opcao__origem">· do grupo</span>' : ""}
            </label>`;
        }).join("");
        return `<div class="perm-modulo">
            <div><span class="perm-modulo__nome">${escaparHtml(rotuloModulo(m.modulo))}</span><span class="perm-modulo__desc">${escaparHtml(m.descricao)}</span></div>
            <div class="perm-modulo__opcoes">${opcoes}</div>
          </div>`;
      }).join("");
      atualizarContador();
    }

    lista.addEventListener("change", (evento) => {
      const caixa = evento.target.closest("input[data-codigo]");
      if (!caixa || travado) return;
      const codigo = caixa.dataset.codigo;
      const [modulo, acao] = codigo.split(".");
      if (caixa.checked) {
        selecionadas.add(codigo);
        const ver = `${modulo}.ver`;
        if (acao === "editar" && !herdadas.has(ver) && catalogo.find(m => m.modulo === modulo)?.permissoes.some(p => p.codigo === ver)) selecionadas.add(ver);
      } else {
        selecionadas.delete(codigo);
      }
      renderizar();
      if (aoMudar) aoMudar();
    });

    return {
      definirCatalogo(c) { catalogo = c || []; renderizar(); },
      temCatalogo() { return catalogo.length > 0; },
      definir(marcadas = [], deGrupo = []) {
        herdadas = new Set(deGrupo);
        selecionadas = new Set((marcadas || []).filter(c => !herdadas.has(c)));
        renderizar();
      },
      obter() { return codigos().filter(c => selecionadas.has(c)); },
      codigos,
      total() { return codigos().length; },
      marcarTudo() { selecionadas = new Set(codigos().filter(c => !herdadas.has(c))); renderizar(); if (aoMudar) aoMudar(); },
      limpar() { selecionadas = new Set(); renderizar(); if (aoMudar) aoMudar(); },
      travar(valor) { travado = !!valor; renderizar(); }
    };
  }
};
