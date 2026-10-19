// Modal de baixa: registra o pagamento (conta a pagar) ou o recebimento (conta a receber), total ou parcial.
//   baixaModal.abrir({ titulo, aoSalvar, aoAtualizar })
//   - titulo: o título como veio da API (precisa de id, tipo, valor, valor_pago, saldo, vencimento...)
//   - aoSalvar(tituloAtualizado): chamado depois que a baixa foi registrada
//   - aoAtualizar(tituloAtual): chamado se o título mudou por fora (já pago, cancelado...) e o modal foi fechado
// Depende de: financeiroService, formatadores.js, mascaras.js e feedback.js. O HTML é criado aqui.

const baixaModal = (() => {
  let el = null;
  let estado = null;     // { titulo, aoSalvar, aoAtualizar }
  let enviando = false;

  function montar() {
    if (el) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modal-baixa";
    overlay.innerHTML = `
      <div class="modal modal--baixa" role="dialog" aria-modal="true" aria-labelledby="baixa-titulo-modal">
        <div class="modal__topo">
          <span class="modal__titulo" id="baixa-titulo-modal">Registrar pagamento</span>
          <button type="button" class="modal__fechar" id="baixa-fechar" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form id="baixa-form" novalidate>
          <div class="modal__corpo">
            <div class="resumo-baixa" id="baixa-resumo"></div>

            <div class="campo-form" id="baixa-grupo-valor">
              <label for="baixa-valor" id="baixa-rotulo-valor">Valor pago *</label>
              <div class="baixa-valor-linha">
                <div class="campo-moeda"><input type="text" id="baixa-valor" inputmode="numeric" autocomplete="off" placeholder="0,00"></div>
                <button type="button" class="botao-secundario" id="baixa-saldo-total">Saldo total</button>
              </div>
              <span class="campo-erro-msg" id="baixa-erro-valor"></span>
              <span class="fin-dica" id="baixa-restante"></span>
            </div>

            <div class="campo-form" id="baixa-grupo-data">
              <label for="baixa-data">Data *</label>
              <input type="date" id="baixa-data">
              <span class="campo-erro-msg" id="baixa-erro-data"></span>
            </div>

            <div class="campo-form" id="baixa-grupo-obs">
              <label for="baixa-obs">Observação (opcional)</label>
              <input type="text" id="baixa-obs" maxlength="255" placeholder="Ex.: Pix, comprovante nº..., pagamento no balcão">
              <span class="campo-erro-msg" id="baixa-erro-obs"></span>
            </div>
          </div>
          <div class="modal__rodape">
            <button type="button" class="botao-secundario" id="baixa-cancelar">Cancelar</button>
            <button type="submit" class="botao-sucesso" id="baixa-confirmar">Confirmar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    el = {
      overlay,
      titulo: overlay.querySelector("#baixa-titulo-modal"),
      form: overlay.querySelector("#baixa-form"),
      resumo: overlay.querySelector("#baixa-resumo"),
      rotuloValor: overlay.querySelector("#baixa-rotulo-valor"),
      valor: overlay.querySelector("#baixa-valor"),
      saldoTotal: overlay.querySelector("#baixa-saldo-total"),
      restante: overlay.querySelector("#baixa-restante"),
      data: overlay.querySelector("#baixa-data"),
      obs: overlay.querySelector("#baixa-obs"),
      confirmar: overlay.querySelector("#baixa-confirmar"),
      cancelar: overlay.querySelector("#baixa-cancelar"),
      fechar: overlay.querySelector("#baixa-fechar")
    };

    aplicarMascaraMoeda(el.valor);
    el.valor.addEventListener("input", atualizarRestante);
    el.saldoTotal.addEventListener("click", () => { preencherSaldoTotal(); el.valor.focus(); });
    el.form.addEventListener("submit", enviar);
    el.fechar.addEventListener("click", fechar);
    el.cancelar.addEventListener("click", fechar);
    el.overlay.addEventListener("mousedown", (e) => { if (e.target === el.overlay) fechar(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.overlay.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) fechar();
    });
  }

  const centavosDe = (numero) => Math.round(Number(numero) * 100);

  function hojeLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function saldoCentavos() {
    return centavosDe(estado.titulo.valor) - centavosDe(estado.titulo.valor_pago);
  }

  function preencherSaldoTotal() {
    el.valor.value = numeroParaMoeda(saldoCentavos() / 100);
    atualizarRestante();
  }

  function atualizarRestante() {
    const n = moedaParaNumero(el.valor.value);
    const c = n === null ? null : Math.round(n * 100);
    if (c === null || c <= 0) { el.restante.textContent = `Saldo do título: ${formatarMoeda(saldoCentavos() / 100)}.`; return; }
    const resta = saldoCentavos() - c;
    if (resta < 0) el.restante.textContent = `Maior que o saldo do título (${formatarMoeda(saldoCentavos() / 100)}).`;
    else if (resta === 0) el.restante.textContent = "Quita o título.";
    else el.restante.textContent = `Baixa parcial: depois dela, restam ${formatarMoeda(resta / 100)}.`;
  }

  function desenharResumo() {
    const t = estado.titulo;
    const parte = t.tipo === "receber" ? t.cliente_nome : t.fornecedor_nome;
    const linhas = [
      ["Título", t.origem || t.descricao || "—"],
      [t.tipo === "receber" ? "Cliente" : "Fornecedor", parte || "—"],
      ["Parcela", `${t.numero_parcela}/${t.total_parcelas}`],
      ["Vencimento", formatarData(t.vencimento) + (t.vencido ? ` (${t.dias_atraso} ${t.dias_atraso === 1 ? "dia" : "dias"} de atraso)` : "")],
      ["Valor", formatarMoeda(t.valor)],
      [t.tipo === "receber" ? "Já recebido" : "Já pago", formatarMoeda(t.valor_pago)],
      ["Saldo", formatarMoeda(saldoCentavos() / 100)]
    ];
    el.resumo.innerHTML = linhas.map(([rotulo, valor]) =>
      `<div class="resumo-baixa__item"><span class="resumo-baixa__rotulo">${escaparHtml(rotulo)}</span><span class="resumo-baixa__valor">${escaparHtml(valor)}</span></div>`
    ).join("");
  }

  function erroCampo(nome, mensagem) {
    const g = el.overlay.querySelector(`#baixa-grupo-${nome}`);
    g.classList.add("invalido");
    el.overlay.querySelector(`#baixa-erro-${nome}`).textContent = mensagem;
  }

  function validar() {
    el.overlay.querySelectorAll(".campo-form.invalido").forEach(g => g.classList.remove("invalido"));
    let foco = null;
    const marcar = (nome, msg, campo) => { erroCampo(nome, msg); if (!foco) foco = campo; };

    const n = moedaParaNumero(el.valor.value);
    const c = n === null ? null : Math.round(n * 100);
    if (c === null || c <= 0) marcar("valor", "Informe um valor maior que zero.", el.valor);
    else if (c > saldoCentavos()) marcar("valor", `O valor não pode passar do saldo (${formatarMoeda(saldoCentavos() / 100)}).`, el.valor);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(el.data.value)) marcar("data", "Informe a data.", el.data);
    else if (el.data.value > hojeLocal()) marcar("data", "A data não pode ser futura.", el.data);

    if (foco) return { foco };
    return { payload: { valor: c / 100, data_pagamento: el.data.value, observacao: el.obs.value.trim() || null } };
  }

  function definirEnviando(valor) {
    enviando = valor;
    el.confirmar.disabled = valor;
    el.cancelar.disabled = valor;
    el.saldoTotal.disabled = valor;
    el.confirmar.textContent = valor ? "Registrando..." : (estado.titulo.tipo === "receber" ? "Confirmar recebimento" : "Confirmar pagamento");
  }

  function fecharModal() {
    el.overlay.classList.remove("aberto");
    estado = null;
  }

  function fechar() {
    if (enviando) return;
    fecharModal();
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;
    const { payload, foco } = validar();
    if (foco) { toast.erro("Corrija os campos destacados."); foco.focus(); return; }

    const receber = estado.titulo.tipo === "receber";
    definirEnviando(true);
    try {
      const atualizado = await financeiroService.darBaixa(estado.titulo.id, payload);
      const callback = estado.aoSalvar;
      enviando = false;
      fecharModal();
      toast.sucesso(atualizado.status === "pago"
        ? (receber ? "Recebimento registrado. Título quitado." : "Pagamento registrado. Título quitado.")
        : (receber ? "Recebimento parcial registrado." : "Pagamento parcial registrado."));
      if (callback) await callback(atualizado);
    } catch (e) {
      definirEnviando(false);
      toast.erro(e.message);
      // Se o título mudou por fora (já quitado, cancelado, outra baixa), mostra o estado real.
      try {
        const atual = await financeiroService.buscarTitulo(estado.titulo.id);
        const aberto = atual.status === "aberto" || atual.status === "parcial";
        const callbackAtualizar = estado.aoAtualizar;
        if (!aberto) {
          fecharModal();
          if (callbackAtualizar) await callbackAtualizar(atual);
        } else if (centavosDe(atual.valor_pago) !== centavosDe(estado.titulo.valor_pago)) {
          estado.titulo = atual;
          desenharResumo();
          atualizarRestante();
          if (callbackAtualizar) await callbackAtualizar(atual);
        }
      } catch { /* mantém o modal aberto com a mensagem de erro já exibida */ }
    }
  }

  function abrir({ titulo, aoSalvar = null, aoAtualizar = null } = {}) {
    montar();
    if (el.overlay.classList.contains("aberto")) return;
    estado = { titulo, aoSalvar, aoAtualizar };
    enviando = false;
    el.overlay.querySelectorAll(".campo-form.invalido").forEach(g => g.classList.remove("invalido"));
    const receber = titulo.tipo === "receber";
    el.titulo.textContent = receber ? "Registrar recebimento" : "Registrar pagamento";
    el.rotuloValor.textContent = receber ? "Valor recebido *" : "Valor pago *";
    el.form.reset();
    el.data.value = hojeLocal();
    el.data.max = hojeLocal();
    desenharResumo();
    preencherSaldoTotal();
    definirEnviando(false);
    el.overlay.classList.add("aberto");
    el.valor.focus();
    el.valor.select();
  }

  return { abrir };
})();
