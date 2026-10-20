// Janela "Alterar senha": o próprio usuário troca a senha (atual + nova + confirmação).
//   senhaModal.abrir()
// Carregada sob demanda pela sidebar (sidebar.js), junto com css/senha-modal.css.
// Depende de: auth.js (alterarSenha) e feedback.js (toast). O HTML é criado aqui.
// Regras iguais às do cadastro de usuários: 8 a 72 bytes. O backend valida de novo.

const senhaModal = (() => {
  const MINIMO = 8;
  const MAXIMO_BYTES = 72;   // limite do bcrypt: o backend recusa em vez de cortar em silêncio

  const ICONE_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const ICONE_OLHO_RISCADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  const ICONE_FECHAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  let el = null;
  let enviando = false;

  function campoHtml(id, rotulo, autocomplete) {
    return `
      <div class="senha-campo" id="senha-grupo-${id}">
        <label for="senha-${id}">${rotulo}</label>
        <div class="senha-entrada">
          <input type="password" id="senha-${id}" autocomplete="${autocomplete}" maxlength="128" spellcheck="false">
          <button type="button" class="senha-olho" data-alvo="senha-${id}" aria-label="Mostrar senha" title="Mostrar senha">${ICONE_OLHO}</button>
        </div>
        <span class="senha-erro" id="senha-erro-${id}" role="alert"></span>
      </div>`;
  }

  function montar() {
    if (el) return;
    const overlay = document.createElement("div");
    overlay.className = "senha-overlay";
    overlay.innerHTML = `
      <div class="senha-modal" role="dialog" aria-modal="true" aria-labelledby="senha-titulo">
        <div class="senha-topo">
          <span class="senha-titulo" id="senha-titulo">Alterar senha</span>
          <button type="button" class="senha-fechar" id="senha-fechar" aria-label="Fechar">${ICONE_FECHAR}</button>
        </div>
        <form id="senha-form" novalidate>
          <div class="senha-corpo">
            ${campoHtml("atual", "Senha atual", "current-password")}
            ${campoHtml("nova", "Nova senha", "new-password")}
            <span class="senha-dica">Mínimo de ${MINIMO} caracteres.</span>
            ${campoHtml("confirmacao", "Confirmar nova senha", "new-password")}
            <div class="senha-erro-geral" id="senha-erro-geral" role="alert" hidden></div>
            <p class="senha-aviso">Ao trocar a senha, as outras sessões abertas com a sua conta serão encerradas.</p>
          </div>
          <div class="senha-rodape">
            <button type="button" class="senha-botao senha-botao--secundario" id="senha-cancelar">Cancelar</button>
            <button type="submit" class="senha-botao senha-botao--primario" id="senha-confirmar">Alterar senha</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    el = {
      overlay,
      form: overlay.querySelector("#senha-form"),
      atual: overlay.querySelector("#senha-atual"),
      nova: overlay.querySelector("#senha-nova"),
      confirmacao: overlay.querySelector("#senha-confirmacao"),
      geral: overlay.querySelector("#senha-erro-geral"),
      confirmar: overlay.querySelector("#senha-confirmar"),
      cancelar: overlay.querySelector("#senha-cancelar"),
      fechar: overlay.querySelector("#senha-fechar")
    };

    el.form.addEventListener("submit", enviar);
    el.fechar.addEventListener("click", fechar);
    el.cancelar.addEventListener("click", fechar);
    el.overlay.addEventListener("mousedown", (e) => { if (e.target === el.overlay) fechar(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.overlay.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) fechar();
    });

    overlay.querySelectorAll(".senha-olho").forEach(botao => {
      botao.addEventListener("click", () => {
        const campo = overlay.querySelector("#" + botao.dataset.alvo);
        const mostrar = campo.type === "password";
        campo.type = mostrar ? "text" : "password";
        botao.innerHTML = mostrar ? ICONE_OLHO_RISCADO : ICONE_OLHO;
        const rotulo = mostrar ? "Ocultar senha" : "Mostrar senha";
        botao.setAttribute("aria-label", rotulo);
        botao.title = rotulo;
        campo.focus();
      });
    });

    [el.atual, el.nova, el.confirmacao].forEach(campo => {
      campo.addEventListener("input", () => { limparErroCampo(campo); mostrarErroGeral(""); });
    });
  }

  function erroDe(campo) { return el.overlay.querySelector("#senha-erro-" + campo.id.replace("senha-", "")); }

  function limparErroCampo(campo) {
    campo.closest(".senha-campo").classList.remove("senha-campo--erro");
    erroDe(campo).textContent = "";
  }

  function mostrarErroCampo(campo, mensagem) {
    campo.closest(".senha-campo").classList.add("senha-campo--erro");
    erroDe(campo).textContent = mensagem;
  }

  function mostrarErroGeral(mensagem) {
    el.geral.textContent = mensagem;
    el.geral.hidden = !mensagem;
  }

  const bytesDe = (texto) => new TextEncoder().encode(texto).length;

  // Devolve o primeiro campo com problema (para focar), ou null se está tudo certo.
  function validar() {
    [el.atual, el.nova, el.confirmacao].forEach(limparErroCampo);
    mostrarErroGeral("");
    let primeiro = null;
    const falha = (campo, mensagem) => { mostrarErroCampo(campo, mensagem); primeiro = primeiro || campo; };

    const atual = el.atual.value;
    const nova = el.nova.value;
    const confirmacao = el.confirmacao.value;

    if (!atual) falha(el.atual, "Informe a senha atual.");

    if (!nova) falha(el.nova, "Informe a nova senha.");
    else if (nova.length < MINIMO) falha(el.nova, `A nova senha deve ter no mínimo ${MINIMO} caracteres.`);
    else if (bytesDe(nova) > MAXIMO_BYTES) falha(el.nova, `A nova senha é longa demais (máximo de ${MAXIMO_BYTES} bytes, cerca de ${MAXIMO_BYTES} caracteres sem acentos).`);
    else if (atual && nova === atual) falha(el.nova, "A nova senha deve ser diferente da atual.");

    if (!confirmacao) falha(el.confirmacao, "Repita a nova senha.");
    else if (nova && confirmacao !== nova) falha(el.confirmacao, "A confirmação não é igual à nova senha.");

    return primeiro;
  }

  function definirEnviando(valor) {
    enviando = valor;
    el.confirmar.disabled = valor;
    el.cancelar.disabled = valor;
    el.confirmar.textContent = valor ? "Alterando..." : "Alterar senha";
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const problema = validar();
    if (problema) { problema.focus(); return; }

    definirEnviando(true);
    try {
      await alterarSenha(el.atual.value, el.nova.value);
      fechar(true);
      toast.sucesso("Senha alterada. Nos outros dispositivos será preciso entrar de novo.");
    } catch (erro) {
      if (erro.status === 401) return;   // sessão expirada: o api.js já mandou para o login
      if (erro.status === 400 && /atual incorreta/i.test(erro.message)) {
        mostrarErroCampo(el.atual, erro.message);
        el.atual.focus();
        el.atual.select();
      } else if (erro.status === 400 && /diferente/i.test(erro.message)) {
        mostrarErroCampo(el.nova, erro.message);
        el.nova.focus();
      } else {
        mostrarErroGeral(erro.message || "Não foi possível alterar a senha.");
      }
    } finally {
      if (el) definirEnviando(false);
    }
  }

  function abrir() {
    montar();
    el.form.reset();
    [el.atual, el.nova, el.confirmacao].forEach(campo => {
      campo.type = "password";
      limparErroCampo(campo);
    });
    el.overlay.querySelectorAll(".senha-olho").forEach(botao => {
      botao.innerHTML = ICONE_OLHO;
      botao.setAttribute("aria-label", "Mostrar senha");
      botao.title = "Mostrar senha";
    });
    mostrarErroGeral("");
    definirEnviando(false);
    el.overlay.classList.add("aberto");
    el.atual.focus();
  }

  function fechar(forcar) {
    if (!el || (enviando && forcar !== true)) return;
    el.overlay.classList.remove("aberto");
    el.form.reset();   // não deixa senha digitada guardada no formulário
    const gatilho = document.getElementById("sidebar-senha");
    if (gatilho) gatilho.focus();
  }

  return { abrir };
})();
