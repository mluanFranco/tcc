// Funções de autenticação: salvar/recuperar token, logout, verificação de sessão,
// decodificação do token, perfil do usuário (permissões vindas de /usuarios/me)
// e checagem de acesso por permissão.

const TOKEN_KEY = "nova_sorvetes_token";
const PERFIL_KEY = "nova_sorvetes_perfil";

// Versão do formato das permissões no perfil salvo. Mudou o catálogo (ex.: "cadastros.editar" virou 7 módulos)?
// Sobe o número: o perfil antigo é descartado e o usuário entra de novo uma única vez.
const VERSAO_PERFIL = 2;

// Página inicial de quem não vê o Dashboard: a primeira tela que o usuário pode abrir, nesta ordem.
const PAGINAS_INICIAIS = [
  ["produtos.ver", "produtos.html"], ["vendas.ver", "pedidos-venda.html"], ["compras.ver", "pedidos-compra.html"],
  ["cotacoes.ver", "cotacoes.html"], ["producao.ver", "producao.html"], ["clientes.ver", "clientes.html"],
  ["fornecedores.ver", "fornecedores.html"], ["geladeiras.ver", "geladeiras.html"], ["financeiro.ver", "financeiro.html"],
  ["formas_pagamento.ver", "formas-pagamento.html"], ["categorias.ver", "categorias.html"],
  ["subcategorias.ver", "subcategorias.html"], ["unidades.ver", "unidades-medida.html"], ["assistente.ver", "assistente.html"]
];

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PERFIL_KEY);   // perfil sem token não vale nada
}

function isAuthenticated() {
  return !!getToken();
}

// Decodifica o payload do JWT (sem validar assinatura — isso é papel do backend).
// Usado apenas para ler informações como nome, admin e expiração no frontend.
function decodificarToken(token) {
  try {
    const payloadBase64 = token.split(".")[1];
    const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

// Retorna os dados do usuário logado (nome, admin, etc.), ou null se não houver token.
function getUsuarioAtual() {
  const token = getToken();
  if (!token) return null;

  const payload = decodificarToken(token);
  if (!payload) return null;

  return {
    id: payload.sub,
    nome: payload.nome,
    admin: payload.admin === true
  };
}

function isAdmin() {
  const usuario = getUsuarioAtual();
  return usuario?.admin === true;
}

// Protege páginas exclusivas de administrador.
// Deve ser chamada no topo do script de qualquer página restrita a admins.
function exigirAdmin() {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
    return false;
  }
  if (!isAdmin()) {
    window.location.href = destinoPosLogin() || "login.html";
    return false;
  }
  return true;
}

// Protege páginas que exigem apenas estar logado (qualquer tipo de usuário).
function exigirAutenticacao() {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

// ---------- Perfil e permissões ----------
// O perfil (nome, grupo, foto e permissões efetivas) vem do backend em /usuarios/me.
// O backend continua sendo quem de fato barra o acesso (403); aqui só decidimos o que mostrar.

function salvarPerfil(perfil) {
  localStorage.setItem(PERFIL_KEY, JSON.stringify({ ...perfil, _versao: VERSAO_PERFIL }));
}

function getPerfil() {
  try {
    const perfil = JSON.parse(localStorage.getItem(PERFIL_KEY));
    return perfil && perfil._versao === VERSAO_PERFIL ? perfil : null;   // perfil de versão antiga: pede login de novo
  } catch {
    return null;
  }
}

async function carregarPerfil() {
  const perfil = await apiFetch("/usuarios/me");
  salvarPerfil(perfil);
  return perfil;
}

// Tipos de cotação que o usuário pode ver/criar: compra exige compras.ver; venda, vendas.ver (o backend aplica a mesma regra).
function tiposCotacaoPermitidos() {
  return ["compra", "venda"].filter(t => temPermissao(t === "compra" ? "compras.ver" : "vendas.ver"));
}

// Mesma regra do backend: admin tem tudo; "editar" de um módulo inclui o "ver" dele.
function temPermissao(codigo) {
  const perfil = getPerfil();
  if (!perfil) return false;
  if (perfil.admin) return true;

  const efetivas = perfil.permissoes || [];
  if (efetivas.includes(codigo)) return true;
  return codigo.endsWith(".ver") && efetivas.includes(codigo.slice(0, -4) + ".editar");
}

// Para onde o usuário vai depois do login (e quando abre uma tela sem acesso): dashboard para quem vê relatórios;
// os demais, a primeira tela permitida. Sem nenhuma tela: null (o login avisa e não entra).
function destinoPosLogin() {
  if (temPermissao("relatorios.ver")) return "dashboard.html";
  const pagina = PAGINAS_INICIAIS.find(([codigo]) => temPermissao(codigo));
  return pagina ? pagina[1] : null;
}

// Protege páginas que exigem uma permissão (ex.: exigirPermissao("relatorios.ver")).
// Retorna false (e já redireciona) quando o acesso não é permitido.
function exigirPermissao(codigo) {
  if (!isAuthenticated()) {
    window.location.href = "login.html";
    return false;
  }
  // Sessão aberta antes desta versão (token sem perfil): pede um novo login uma única vez.
  if (!getPerfil()) {
    clearToken();
    window.location.href = "login.html";
    return false;
  }
  if (!temPermissao(codigo)) {
    const destino = destinoPosLogin();
    if (destino && !window.location.pathname.endsWith("/" + destino)) {
      window.location.href = destino;
    } else {   // nenhuma tela permitida: volta ao login, que explica
      clearToken();
      window.location.href = "login.html";
    }
    return false;
  }
  return true;
}

async function login(email, senha) {
  const resposta = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, senha })
  });

  setToken(resposta.access_token);
  return resposta;
}

// Troca de senha pelo próprio usuário. O backend devolve um token novo (as sessões antigas deixam de valer),
// e guardá-lo aqui mantém esta aba logada. Erro de senha atual chega como ApiError 400 (não 401).
async function alterarSenha(senhaAtual, senhaNova) {
  const resposta = await apiFetch("/auth/senha", {
    method: "PUT",
    body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova })
  });

  setToken(resposta.access_token);
  return resposta;
}

function logout() {
  clearToken();
  window.location.href = "login.html";
}
