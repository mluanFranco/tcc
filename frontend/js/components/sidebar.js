// Navegação lateral (sidebar) colapsável.
// Cada item declara a permissão necessária (temPermissao, de auth.js); sem permissão, o item não aparece.
// Itens sem "permissao" aparecem para qualquer usuário logado (ex.: cadastros, cuja leitura é livre).
// "apenasAdmin" é para o que só administrador acessa. "tambem" lista páginas internas que mantêm o item ativo.

const SIDEBAR_COLAPSADO_KEY = "nova_sorvetes_sidebar_colapsado";
const SIDEBAR_GRUPOS_ABERTOS_KEY = "nova_sorvetes_sidebar_grupos_abertos";

const ITENS_MENU = [
  { label: "Dashboard", href: "dashboard.html", permissao: "relatorios.ver", icone: "dashboard" },
  {
    tipo: "grupo", label: "Cadastros", icone: "cadastro",
    subitens: [
      { label: "Produtos",           href: "produtos.html" },
      { label: "Categorias",         href: "categorias.html" },
      { label: "Subcategorias",      href: "subcategorias.html" },
      { label: "Unidades de Medida", href: "unidades-medida.html" },
      { label: "Clientes",           href: "clientes.html" },
      { label: "Fornecedores",       href: "fornecedores.html" }
    ]
  },
  {
    tipo: "grupo", label: "Pedidos", icone: "venda",
    subitens: [
      { label: "Pedidos de Venda",  href: "pedidos-venda.html",  tambem: ["pedido-venda-novo.html", "pedido-venda-detalhe.html"],  permissao: "vendas.ver" },
      { label: "Pedidos de Compra", href: "pedidos-compra.html", tambem: ["pedido-compra-novo.html", "pedido-compra-detalhe.html"], permissao: "compras.ver" }
    ]
  },
  { label: "Cotações",            href: "cotacoes.html",         tambem: ["cotacao-nova.html", "cotacao-detalhe.html"],   permissao: "cotacoes.ver",   icone: "cotacao" },
  { label: "Produção",            href: "producao.html",         tambem: ["receita-nova.html", "receita-detalhe.html", "ordem-producao-nova.html", "ordem-producao-detalhe.html"], permissao: "producao.ver", icone: "producao" },
  { label: "Formas de Pagamento", href: "formas-pagamento.html", icone: "pagamento" },
  { label: "Financeiro",          href: "financeiro.html",       tambem: ["titulo-detalhe.html"], permissao: "financeiro.ver", icone: "financeiro" },
  { label: "Geladeiras",          href: "geladeiras.html",       tambem: ["geladeira-detalhe.html"], permissao: "geladeiras.ver", icone: "geladeira" },
  { label: "Grupos de Acesso",    href: "grupos-acesso.html",    apenasAdmin: true, icone: "grupo" },
  { label: "Assistente de IA",    href: "assistente.html",       permissao: "assistente.ver", icone: "assistente" },
  { label: "Usuários",            href: "usuarios.html",         apenasAdmin: true, icone: "usuario" }
];

const _svg = (corpo) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

const ICONES_SVG = {
  dashboard: _svg('<line x1="6" y1="20" x2="6" y2="12"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="18" y1="20" x2="18" y2="9"></line>'),
  cadastro:  _svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'),
  venda:     _svg('<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>'),
  cotacao:   _svg('<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>'),
  producao:  _svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>'),
  geladeira: _svg('<rect x="2" y="3" width="20" height="8" rx="2"></rect><rect x="2" y="13" width="20" height="8" rx="2"></rect><line x1="6" y1="7" x2="6.01" y2="7"></line><line x1="6" y1="17" x2="6.01" y2="17"></line>'),
  financeiro: _svg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>'),
  pagamento: _svg('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>'),
  grupo:     _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline>'),
  assistente: _svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path>'),
  usuario:   _svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>')
};

const ICONE_TOGGLE = _svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>');
const ICONE_LOGOUT = _svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>');
const ICONE_GRUPO_SETA = _svg('<polyline points="6 9 12 15 18 9"></polyline>');

function isSidebarColapsado() {
  try { return localStorage.getItem(SIDEBAR_COLAPSADO_KEY) === "true"; } catch { return false; }
}

function definirSidebarColapsado(colapsado) {
  try { localStorage.setItem(SIDEBAR_COLAPSADO_KEY, colapsado ? "true" : "false"); } catch { /* sem armazenamento: só não lembra */ }
}

function obterGruposAbertos() {
  try { return JSON.parse(localStorage.getItem(SIDEBAR_GRUPOS_ABERTOS_KEY)) || {}; } catch { return {}; }
}

function definirGrupoAberto(labelGrupo, aberto) {
  const grupos = obterGruposAbertos();
  grupos[labelGrupo] = aberto;
  try { localStorage.setItem(SIDEBAR_GRUPOS_ABERTOS_KEY, JSON.stringify(grupos)); } catch { /* idem */ }
}

function _esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _iniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function _podeVer(item, ehAdmin) {
  if (item.apenasAdmin) return ehAdmin;
  if (item.permissao) return temPermissao(item.permissao);
  return true;
}

function _ehPaginaAtiva(item, paginaAtual) {
  return item.href === paginaAtual || (item.tambem || []).includes(paginaAtual);
}

function renderizarSidebar() {
  const container = document.getElementById("sidebar");
  if (!container) return;

  const perfil = (typeof getPerfil === "function" && getPerfil()) || getUsuarioAtual() || {};
  const ehAdmin = !!perfil.admin;
  const paginaAtual = window.location.pathname.split("/").pop();
  const colapsado = isSidebarColapsado();
  const gruposAbertos = obterGruposAbertos();

  const itensHtml = ITENS_MENU.map(item => {
    if (item.tipo === "grupo") {
      const visiveis = item.subitens.filter(s => _podeVer(s, ehAdmin));
      if (visiveis.length === 0) return "";

      const contemAtivo = visiveis.some(s => _ehPaginaAtiva(s, paginaAtual));
      const preferencia = Object.prototype.hasOwnProperty.call(gruposAbertos, item.label);
      const aberto = contemAtivo || (preferencia && gruposAbertos[item.label] === true);

      const subitensHtml = visiveis.map(sub => `
        <a href="${sub.href}" class="sidebar__subitem ${_ehPaginaAtiva(sub, paginaAtual) ? "sidebar__subitem--ativo" : ""}">${_esc(sub.label)}</a>
      `).join("");

      return `
        <div class="sidebar__grupo ${aberto ? "sidebar__grupo--aberto" : ""}">
          <button type="button" class="sidebar__grupo-cabecalho ${contemAtivo ? "sidebar__grupo-cabecalho--ativo" : ""}" data-grupo="${_esc(item.label)}" title="${_esc(item.label)}" aria-expanded="${aberto}">
            <span class="sidebar__item-icone">${ICONES_SVG[item.icone]}</span>
            <span class="sidebar__item-label">${_esc(item.label)}</span>
            <span class="sidebar__grupo-seta">${ICONE_GRUPO_SETA}</span>
          </button>
          <div class="sidebar__subitens">${subitensHtml}</div>
        </div>
      `;
    }

    if (!_podeVer(item, ehAdmin)) return "";
    const ativo = _ehPaginaAtiva(item, paginaAtual) ? "sidebar__item--ativo" : "";
    return `
      <a href="${item.href}" class="sidebar__item ${ativo}" title="${_esc(item.label)}">
        <span class="sidebar__item-icone">${ICONES_SVG[item.icone]}</span>
        <span class="sidebar__item-label">${_esc(item.label)}</span>
      </a>
    `;
  }).join("");

  const papel = ehAdmin ? "Administrador" : (perfil.grupo?.nome || perfil.grupo || "");
  const nome = perfil.nome || "";

  container.className = `sidebar ${colapsado ? "colapsado" : ""}`;
  container.innerHTML = `
    <div class="sidebar__topo">
      <a href="${_podeVer({ permissao: "relatorios.ver" }, ehAdmin) ? "dashboard.html" : PAGINA_INICIAL_USUARIO_COMUM}" class="sidebar__marca" title="Nova Sorvetes">
        <img src="../assets/images/logo-sidebar.png" alt="" class="sidebar__logo" width="34" height="26">
        <span class="sidebar__marca-texto">Nova Sorvetes</span>
      </a>
      <button type="button" class="sidebar__toggle" id="sidebar-toggle" aria-label="${colapsado ? "Expandir menu" : "Recolher menu"}" title="${colapsado ? "Expandir menu" : "Recolher menu"}">${ICONE_TOGGLE}</button>
    </div>
    <nav class="sidebar__menu" aria-label="Menu principal">${itensHtml}</nav>
    <div class="sidebar__rodape">
      <span class="sidebar__avatar" id="sidebar-avatar" aria-hidden="true">${_esc(_iniciais(nome))}</span>
      <span class="sidebar__usuario-bloco">
        <span class="sidebar__usuario">${_esc(nome)}</span>
        <span class="sidebar__papel">${_esc(papel)}</span>
      </span>
      <button type="button" id="sidebar-logout" class="sidebar__logout" aria-label="Sair" title="Sair">${ICONE_LOGOUT}</button>
    </div>
  `;

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    definirSidebarColapsado(!isSidebarColapsado());
    renderizarSidebar();
  });
  document.getElementById("sidebar-logout").addEventListener("click", logout);

  document.querySelectorAll(".sidebar__grupo-cabecalho").forEach(botao => {
    botao.addEventListener("click", () => {
      const grupoEl = botao.closest(".sidebar__grupo");
      definirGrupoAberto(botao.dataset.grupo, !grupoEl.classList.contains("sidebar__grupo--aberto"));
      renderizarSidebar();
    });
  });

  carregarFotoSidebar(perfil);
}

// A foto exige o token no cabeçalho; <img src> não envia, então baixamos como blob.
let _fotoSidebarUrl = null;
async function carregarFotoSidebar(perfil) {
  const avatar = document.getElementById("sidebar-avatar");
  if (!avatar || !perfil.foto_url) return;
  try {
    if (!_fotoSidebarUrl) {
      const resposta = await fetch(CONFIG.API_BASE_URL + perfil.foto_url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!resposta.ok) return;
      _fotoSidebarUrl = URL.createObjectURL(await resposta.blob());
    }
    avatar.textContent = "";
    avatar.style.backgroundImage = `url("${_fotoSidebarUrl}")`;
    avatar.classList.add("sidebar__avatar--foto");
  } catch { /* fica com as iniciais */ }
}

document.addEventListener("DOMContentLoaded", renderizarSidebar);
