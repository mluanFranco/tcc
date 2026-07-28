// Lógica específica da tela de login.

const ICONE_OLHO_ABERTO = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const ICONE_OLHO_CORTADO = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
`;

document.addEventListener("DOMContentLoaded", () => {
  // Se o usuário já está autenticado, não faz sentido ver a tela de login
  if (isAuthenticated()) {
    window.location.href = "../pages/dashboard.html";
    return;
  }

  const form = document.getElementById("form-login");
  const botaoEntrar = document.getElementById("botao-entrar");
  const campoEmail = document.getElementById("email");
  const campoSenha = document.getElementById("senha");
  const blocoErro = document.getElementById("login-erro");
  const mensagemErro = document.getElementById("login-erro-mensagem");
  const toggleSenha = document.getElementById("toggle-senha");

  // Alternar visibilidade da senha — troca o type do input E o ícone exibido,
  // mantendo os dois sincronizados com o estado atual.
  toggleSenha.addEventListener("click", () => {
    const visivel = campoSenha.type === "text";

    campoSenha.type = visivel ? "password" : "text";
    toggleSenha.innerHTML = visivel ? ICONE_OLHO_ABERTO : ICONE_OLHO_CORTADO;
    toggleSenha.setAttribute("aria-label", visivel ? "Mostrar senha" : "Ocultar senha");
  });

  function exibirErro(mensagem) {
    mensagemErro.textContent = mensagem;
    blocoErro.classList.add("visivel");
  }

  function ocultarErro() {
    blocoErro.classList.remove("visivel");
  }

  function definirCarregando(carregando) {
    botaoEntrar.disabled = carregando;
    botaoEntrar.textContent = carregando ? "Entrando..." : "Entrar";
  }

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ocultarErro();

    const email = campoEmail.value.trim();
    const senha = campoSenha.value;

    if (!email || !senha) {
      exibirErro("Preencha email e senha.");
      return;
    }

    definirCarregando(true);

    try {
      await login(email, senha);
      window.location.href = "../pages/dashboard.html";
    } catch (erro) {
      if (erro.status === 401 || erro.status === 403) {
        exibirErro(erro.message);
      } else {
        exibirErro("Não foi possível entrar. Tente novamente.");
      }
    } finally {
      definirCarregando(false);
    }
  });
});