// Funções de autenticação: salvar/recuperar token, logout, verificação de sessão,
// decodificação do token e checagem de permissão (admin).

const TOKEN_KEY = "nova_sorvetes_token";

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