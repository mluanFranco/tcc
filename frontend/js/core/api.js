// Função central de comunicação com a API.
// Todo "service" (produtoService, clienteService, etc.) usa esta função,
// garantindo que o token JWT seja sempre enviado e que erros sejam tratados
// de forma consistente em todo o sistema.

async function apiFetch(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;

  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (erro) {
    throw new ApiError("Não foi possível conectar ao servidor.", 0);
  }

  // 401 no próprio login significa "credenciais inválidas", não "sessão expirada".
  // Deixa esse caso passar para quem chamou tratar a mensagem correta.
  const isLoginEndpoint = endpoint === "/auth/login";

  if (response.status === 401 && !isLoginEndpoint) {
    clearToken();
    if (!window.location.pathname.includes("login.html")) {
      window.location.href = "login.html";
    }
    throw new ApiError("Sessão expirada. Faça login novamente.", 401);
  }

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const mensagem = body?.detail || "Ocorreu um erro inesperado.";
    throw new ApiError(mensagem, response.status);
  }

  return body;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}