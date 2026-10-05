// Componente de navegação lateral (sidebar) colapsável.
// Renderiza os itens de menu de acordo com o tipo de usuário (admin ou comum).
// Suporta dois tipos de item: link direto, e grupo expansível com subitens.

const SIDEBAR_COLAPSADO_KEY = "nova_sorvetes_sidebar_colapsado";
const SIDEBAR_GRUPOS_ABERTOS_KEY = "nova_sorvetes_sidebar_grupos_abertos";

const ITENS_MENU = [
  { label: "Dashboard", href: "dashboard.html", apenasAdmin: true, icone: "dashboard" },
  {
    tipo: "grupo",
    label: "Cadastros",
    icone: "cadastro",
    subitens: [
      { label: "Produtos",           href: "produtos.html",         apenasAdmin: false },
      { label: "Categorias",         href: "categorias.html",       apenasAdmin: false },
      { label: "Subcategorias",      href: "subcategorias.html",    apenasAdmin: false },
      { label: "Unidades de Medida", href: "unidades-medida.html",  apenasAdmin: false },
      { label: "Clientes",           href: "clientes.html",         apenasAdmin: false },
      { label: "Fornecedores",       href: "fornecedores.html",     apenasAdmin: false }
    ]
  },
  { label: "Pedidos de Venda",    href: "pedidos-venda.html",   apenasAdmin: false, icone: "venda"      },
  { label: "Pedidos de Compra",   href: "pedidos-compra.html",  apenasAdmin: false, icone: "compra"     },
  { label: "Cotações",            href: "cotacoes.html",        apenasAdmin: false, icone: "cotacao"    },
  { label: "Geladeiras",          href: "geladeiras.html",      apenasAdmin: false, icone: "geladeira"  },
  { label: "Formas de Pagamento", href: "formas-pagamento.html",apenasAdmin: false, icone: "pagamento"  },
  { label: "Usuários",            href: "usuarios.html",        apenasAdmin: true,  icone: "usuario"    }
];

const ICONES_SVG = {
  dashboard:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>',
  cadastro:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  venda:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>',
  compra:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"></path><path d="M3.27 6.96L12 12l8.73-5.04"></path><path d="M12 22V12"></path></svg>',
  cotacao:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  geladeira:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="5" y1="10" x2="19" y2="10"></line><line x1="9" y1="6" x2="9" y2="6"></line><line x1="9" y1="14" x2="9" y2="14"></line></svg>',
  pagamento:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>',
  usuario:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
};

const ICONE_TOGGLE_EXPANDIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
const ICONE_TOGGLE_COLAPSAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
const ICONE_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
const ICONE_GRUPO_SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

function isSidebarColapsado() {
  return localStorage.getItem(SIDEBAR_COLAPSADO_KEY) === "true";
}

function definirSidebarColapsado(colapsado) {
  localStorage.setItem(SIDEBAR_COLAPSADO_KEY, colapsado ? "true" : "false");
}

function obterGruposAbertos() {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_GRUPOS_ABERTOS_KEY)) || {};
  } catch {
    return {};
  }
}

function definirGrupoAberto(labelGrupo, aberto) {
  const grupos = obterGruposAbertos();
  grupos[labelGrupo] = aberto;
  localStorage.setItem(SIDEBAR_GRUPOS_ABERTOS_KEY, JSON.stringify(grupos));
}

function renderizarSidebar() {
  const container = document.getElementById("sidebar");
  if (!container) return;

  const usuario = getUsuarioAtual();
  const paginaAtual = window.location.pathname.split("/").pop();
  const colapsado = isSidebarColapsado();
  const gruposAbertos = obterGruposAbertos();

  function podeVer(item) {
    return !item.apenasAdmin || usuario?.admin;
  }

  const itensHtml = ITENS_MENU.map(item => {
    if (item.tipo === "grupo") {
      const subitensVisiveis = item.subitens.filter(podeVer);
      if (subitensVisiveis.length === 0) return "";

      const grupoContemAtivo = subitensVisiveis.some(sub => sub.href === paginaAtual);
      const preferenciaExplicita = Object.prototype.hasOwnProperty.call(gruposAbertos, item.label);
      const aberto = preferenciaExplicita ? gruposAbertos[item.label] === true : grupoContemAtivo;

      const subitensHtml = subitensVisiveis.map(sub => {
        const ativo = sub.href === paginaAtual ? "sidebar__subitem--ativo" : "";
        return `
          <a href="${sub.href}" class="sidebar__subitem ${ativo}">
            <span class="sidebar__subitem-label">${sub.label}</span>
          </a>
        `;
      }).join("");

      return `
        <div class="sidebar__grupo ${aberto ? "sidebar__grupo--aberto" : ""}">
          <button class="sidebar__grupo-cabecalho ${grupoContemAtivo ? "sidebar__grupo-cabecalho--ativo" : ""}" data-grupo="${item.label}" title="${item.label}">
            <span class="sidebar__item-icone">${ICONES_SVG[item.icone]}</span>
            <span class="sidebar__item-label">${item.label}</span>
            <span class="sidebar__grupo-seta">${ICONE_GRUPO_SETA}</span>
          </button>
          <div class="sidebar__subitens">
            ${subitensHtml}
          </div>
        </div>
      `;
    }

    if (!podeVer(item)) return "";
    const ativo = item.href === paginaAtual ? "sidebar__item--ativo" : "";
    return `
      <a href="${item.href}" class="sidebar__item ${ativo}" title="${item.label}">
        <span class="sidebar__item-icone">${ICONES_SVG[item.icone]}</span>
        <span class="sidebar__item-label">${item.label}</span>
      </a>
    `;
  }).join("");

  container.className = `sidebar ${colapsado ? "colapsado" : ""}`;
  container.innerHTML = `
    <div class="sidebar__topo">
      <span class="sidebar__marca">Nova Sorvetes</span>
      <button class="sidebar__toggle" id="sidebar-toggle" aria-label="Recolher menu">
        ${colapsado ? ICONE_TOGGLE_EXPANDIR : ICONE_TOGGLE_COLAPSAR}
      </button>
    </div>
    <nav class="sidebar__menu">
      ${itensHtml}
    </nav>
    <div class="sidebar__rodape">
      <span class="sidebar__usuario">${usuario?.nome ?? ""}</span>
      <button id="sidebar-logout" class="sidebar__logout" aria-label="Sair">
        ${ICONE_LOGOUT}
      </button>
    </div>
  `;

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    const novoEstado = !isSidebarColapsado();
    definirSidebarColapsado(novoEstado);
    renderizarSidebar();
  });

  document.getElementById("sidebar-logout").addEventListener("click", logout);

  document.querySelectorAll(".sidebar__grupo-cabecalho").forEach(botao => {
    botao.addEventListener("click", () => {
      const labelGrupo = botao.dataset.grupo;
      const grupoEl = botao.closest(".sidebar__grupo");
      const estaAberto = grupoEl.classList.contains("sidebar__grupo--aberto");
      definirGrupoAberto(labelGrupo, !estaAberto);
      renderizarSidebar();
    });
  });
}

document.addEventListener("DOMContentLoaded", renderizarSidebar);