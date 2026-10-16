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
    throw new ApiError(extrairMensagemErro(body, response.status), response.status);
  }

  return body;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Nomes amigáveis dos campos que mais aparecem nos erros de validação (422).
const ROTULOS_CAMPOS = {
  nome: "Nome", cpf_cnpj: "CPF/CNPJ", cnpj: "CNPJ", tipo: "Tipo", telefone: "Telefone", email: "E-mail",
  cep: "CEP", logradouro: "Logradouro", numero: "Número", complemento: "Complemento", bairro: "Bairro",
  cidade: "Cidade", uf: "UF", ddd: "DDD", senha: "Senha", sigla: "Sigla", descricao: "Descrição",
  categoria_id: "Categoria", subcategoria_id: "Subcategoria", unidade_medida_id: "Unidade de medida",
  preco_custo: "Preço de custo", porcentagem: "Margem", estoque_minimo: "Estoque mínimo",
  endereco_principal: "Endereço"
};

// O FastAPI devolve "detail" como texto (erros de negócio) ou como lista (erros de validação).
// Aqui a lista vira uma frase legível, em vez de "[object Object]".
function extrairMensagemErro(body, status) {
  const detalhe = body?.detail;
  if (typeof detalhe === "string" && detalhe) return detalhe;

  if (Array.isArray(detalhe) && detalhe.length) {
    const frases = detalhe.map(item => {
      const caminho = (item.loc || []).filter(parte => parte !== "body" && typeof parte === "string");
      const campo = caminho.length ? (ROTULOS_CAMPOS[caminho[caminho.length - 1]] || caminho[caminho.length - 1]) : "";
      let texto = String(item.msg || "valor inválido");
      if (texto === "Field required") texto = "campo obrigatório";
      else if (texto.startsWith("Value error, ")) texto = texto.slice("Value error, ".length);
      else if (/at least 1 character/.test(texto)) texto = "não pode ficar vazio";
      else if (/valid email/i.test(texto)) texto = "e-mail inválido";
      // a mensagem do backend já pode começar pelo nome do campo ("CEP inválido...")
      if (!campo || texto.toLowerCase().startsWith(campo.toLowerCase())) return texto;
      return `${campo}: ${texto}`;
    });
    return [...new Set(frases)].join(" • ");
  }

  if (status === 403) return "Você não tem permissão para realizar esta ação.";
  if (status === 404) return "Registro não encontrado.";
  return "Ocorreu um erro inesperado.";
}
