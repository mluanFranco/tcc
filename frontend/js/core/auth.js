// Funções de autenticação: salvar/recuperar token, logout, verificação de sessão,
// decodificação do token, perfil do usuário (permissões vindas de /usuarios/me)
// e checagem de acesso por permissão.

const TOKEN_KEY = "nova_sorvetes_token";
const PERFIL_KEY = "nova_sorvetes_perfil";

// Página inicial do usuário comum, já que dashboard.html é exclusivo de admin.
const PAGINA_INICIAL_USUARIO_COMUM = "produtos.html";

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
    window.location.href = PAGINA_INICIAL_USUARIO_COMUM;
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
  localStorage.setItem(PERFIL_KEY, JSON.stringify(perfil));
}

function getPerfil() {
  try {
    return JSON.parse(localStorage.getItem(PERFIL_KEY));
  } catch {
    return null;
  }
}

async function carregarPerfil() {
  const perfil = await apiFetch("/usuarios/me");
  salvarPerfil(perfil);
  return perfil;
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

// Para onde o usuário vai depois do login: dashboard para quem pode ver relatórios;
// os demais caem em Produtos (cadastros são de leitura livre para qualquer usuário logado).
function destinoPosLogin() {
  return temPermissao("relatorios.ver") ? "dashboard.html" : PAGINA_INICIAL_USUARIO_COMUM;
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
    window.location.href = destinoPosLogin();
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

function logout() {
  clearToken();
  window.location.href = "login.html";
}