// Avisos (toasts) e confirmação em janela própria, no lugar de alert() e confirm().
//   toast.sucesso("Produto salvo.")   toast.erro(erro.message)   toast.info("...")
//   if (await confirmarAcao({ titulo, mensagem, textoConfirmar, perigo: true })) { ... }

const toast = (() => {
  function area() {
    let el = document.getElementById("toast-area");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast-area";
      el.className = "toast-area";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    return el;
  }

  function mostrar(tipo, mensagem, duracaoMs) {
    const item = document.createElement("div");
    item.className = `toast toast--${tipo}`;
    item.setAttribute("role", tipo === "erro" ? "alert" : "status");
    const texto = document.createElement("span");
    texto.className = "toast__texto";
    texto.textContent = mensagem;   // textContent: nunca interpreta HTML
    const fechar = document.createElement("button");
    fechar.className = "toast__fechar";
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar aviso");
    fechar.textContent = "×";
    item.append(texto, fechar);

    const remover = () => {
      item.classList.add("toast--saindo");
      setTimeout(() => item.remove(), 180);
    };
    fechar.addEventListener("click", remover);
    area().appendChild(item);
    setTimeout(remover, duracaoMs);
  }

  return {
    sucesso: (m) => mostrar("sucesso", m, 4000),
    erro: (m) => mostrar("erro", m || "Ocorreu um erro. Tente novamente.", 7000),
    info: (m) => mostrar("info", m, 4000)
  };
})();

function confirmarAcao({ titulo = "Confirmar", mensagem = "", textoConfirmar = "Confirmar", textoCancelar = "Cancelar", perigo = false } = {}) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "confirmacao-overlay";
    const caixa = document.createElement("div");
    caixa.className = "confirmacao";
    caixa.setAttribute("role", "alertdialog");
    caixa.setAttribute("aria-modal", "true");

    const h = document.createElement("h2");
    h.className = "confirmacao__titulo";
    h.textContent = titulo;
    const p = document.createElement("p");
    p.className = "confirmacao__texto";
    p.textContent = mensagem;
    const rodape = document.createElement("div");
    rodape.className = "confirmacao__rodape";
    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "botao-secundario";
    cancelar.textContent = textoCancelar;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = perigo ? "botao-perigo" : "botao-primario";
    ok.textContent = textoConfirmar;
    rodape.append(cancelar, ok);
    caixa.append(h, p, rodape);
    overlay.appendChild(caixa);
    document.body.appendChild(overlay);
    cancelar.focus();

    function fechar(resposta) {
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      if (anterior && anterior.focus) anterior.focus();
      resolve(resposta);
    }
    function aoTeclar(e) { if (e.key === "Escape") fechar(false); }
    document.addEventListener("keydown", aoTeclar);
    cancelar.addEventListener("click", () => fechar(false));
    ok.addEventListener("click", () => fechar(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(false); });
  });
}
