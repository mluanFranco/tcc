// Modal de lançamento avulso (conta a pagar/receber sem pedido): aluguel, energia, folha, outras receitas...
//   lancamentoModal.abrir({ modo: "novo", tipoInicial: "pagar", aoSalvar })
//   lancamentoModal.abrir({ modo: "editar", titulo, aoSalvar })
// Depende de: financeiroService, categoriaFinanceiraService, clienteService, fornecedorService,
// formatadores.js, mascaras.js e feedback.js. O HTML é criado aqui, uma única vez por página.

const lancamentoModal = (() => {
  const LIMITE_VALOR_CENTAVOS = 999999999999;   // 9.999.999.999,99 (o backend aceita 12 dígitos)
  let el = null;
  let estado = null;      // { modo, titulo, aoSalvar, tipo, categorias, clientes, fornecedores, inicial }
  let enviando = false;

  function montar() {
    if (el) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modal-lancamento";
    overlay.innerHTML = `
      <div class="modal modal--larga modal--lancamento" role="dialog" aria-modal="true" aria-labelledby="lanc-titulo-modal">
        <div class="modal__topo">
          <span class="modal__titulo" id="lanc-titulo-modal">Novo lançamento</span>
          <button type="button" class="modal__fechar" id="lanc-fechar" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form id="lanc-form" novalidate>
          <div class="modal__corpo">
            <div class="campo-form" id="lanc-grupo-tipo">
              <label id="lanc-rotulo-tipo">Tipo</label>
              <div class="segmentado" id="lanc-tipo" role="radiogroup" aria-labelledby="lanc-rotulo-tipo">
                <button type="button" class="segmentado__opcao" role="radio" data-tipo="pagar">A pagar</button>
                <button type="button" class="segmentado__opcao" role="radio" data-tipo="receber">A receber</button>
              </div>
              <span class="fin-dica" id="lanc-tipo-fixo" hidden></span>
            </div>

            <div class="campo-form" id="lanc-grupo-descricao">
              <label for="lanc-descricao">Descrição *</label>
              <input type="text" id="lanc-descricao" maxlength="255" placeholder="Ex.: Aluguel da loja, Energia elétrica, Evento...">
              <span class="campo-erro-msg" id="lanc-erro-descricao"></span>
            </div>

            <div class="campo-form-linha">
              <div class="campo-form" id="lanc-grupo-categoria">
                <label for="lanc-categoria">Categoria *</label>
                <select id="lanc-categoria"></select>
                <span class="campo-erro-msg" id="lanc-erro-categoria"></span>
              </div>
              <div class="campo-form" id="lanc-grupo-parte">
                <label for="lanc-parte" id="lanc-rotulo-parte">Fornecedor (opcional)</label>
                <select id="lanc-parte"></select>
                <span class="campo-erro-msg" id="lanc-erro-parte"></span>
              </div>
            </div>

            <div class="campo-form-linha">
              <div class="campo-form" id="lanc-grupo-valor">
                <label for="lanc-valor" id="lanc-rotulo-valor">Valor *</label>
                <div class="campo-moeda"><input type="text" id="lanc-valor" inputmode="numeric" autocomplete="off" placeholder="0,00"></div>
                <span class="campo-erro-msg" id="lanc-erro-valor"></span>
              </div>
              <div class="campo-form" id="lanc-grupo-vencimento">
                <label for="lanc-vencimento" id="lanc-rotulo-vencimento">Vencimento *</label>
                <input type="date" id="lanc-vencimento">
                <span class="campo-erro-msg" id="lanc-erro-vencimento"></span>
              </div>
            </div>

            <div class="lanc-repetir" id="lanc-bloco-repetir">
              <label class="campo-checkbox">
                <input type="checkbox" id="lanc-repetir">
                <span>Repetir todo mês</span>
              </label>
              <div class="campo-form lanc-repetir__meses" id="lanc-grupo-meses" hidden>
                <label for="lanc-meses">Quantos meses (2 a 60)</label>
                <input type="number" id="lanc-meses" min="2" max="60" step="1" value="12" inputmode="numeric">
                <span class="campo-erro-msg" id="lanc-erro-meses"></span>
              </div>
              <p class="fin-dica" id="lanc-previa" hidden></p>
            </div>
          </div>
          <div class="modal__rodape">
            <button type="button" class="botao-secundario" id="lanc-cancelar">Cancelar</button>
            <button type="submit" class="botao-primario" id="lanc-salvar">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    el = {
      overlay,
      titulo: overlay.querySelector("#lanc-titulo-modal"),
      form: overlay.querySelector("#lanc-form"),
      fechar: overlay.querySelector("#lanc-fechar"),
      cancelar: overlay.querySelector("#lanc-cancelar"),
      salvar: overlay.querySelector("#lanc-salvar"),
      tipo: overlay.querySelector("#lanc-tipo"),
      tipoFixo: overlay.querySelector("#lanc-tipo-fixo"),
      descricao: overlay.querySelector("#lanc-descricao"),
      categoria: overlay.querySelector("#lanc-categoria"),
      parte: overlay.querySelector("#lanc-parte"),
      rotuloParte: overlay.querySelector("#lanc-rotulo-parte"),
      valor: overlay.querySelector("#lanc-valor"),
      vencimento: overlay.querySelector("#lanc-vencimento"),
      blocoRepetir: overlay.querySelector("#lanc-bloco-repetir"),
      repetir: overlay.querySelector("#lanc-repetir"),
      grupoMeses: overlay.querySelector("#lanc-grupo-meses"),
      meses: overlay.querySelector("#lanc-meses"),
      previa: overlay.querySelector("#lanc-previa")
    };

    aplicarMascaraMoeda(el.valor);
    el.form.addEventListener("submit", enviar);
    el.fechar.addEventListener("click", tentarFechar);
    el.cancelar.addEventListener("click", tentarFechar);
    el.overlay.addEventListener("mousedown", (e) => { if (e.target === el.overlay) tentarFechar(); });
    el.tipo.addEventListener("click", (e) => {
      const botao = e.target.closest("[data-tipo]");
      if (botao && estado && estado.modo === "novo") escolherTipo(botao.dataset.tipo);
    });
    el.repetir.addEventListener("change", () => { atualizarRepetir(); });
    el.meses.addEventListener("input", atualizarPrevia);
    el.valor.addEventListener("input", atualizarPrevia);
    el.vencimento.addEventListener("input", atualizarPrevia);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.overlay.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) tentarFechar();
    });
    window.addEventListener("beforeunload", (e) => {
      if (el.overlay.classList.contains("aberto") && estaAlterado()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  // ---------- helpers de data e dinheiro ----------
  function somarMeses(iso, meses) {   // igual ao backend: 31/01 + 1 mês = 28/02
    const [a, m, d] = iso.split("-").map(Number);
    const indice = a * 12 + (m - 1) + meses;
    const ano = Math.floor(indice / 12);
    const mes = (indice % 12) + 1;
    const ultimo = new Date(ano, mes, 0).getDate();
    return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
  }

  function dataValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return false;
    const ano = Number(iso.slice(0, 4));
    return ano >= 2000 && ano <= 2100;
  }

  function centavos(texto) {
    const n = moedaParaNumero(texto);
    return n === null ? null : Math.round(n * 100);
  }

  // ---------- campos ----------
  function opcao(valor, texto) {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  }

  function preencherCategorias() {
    const atual = el.categoria.value;
    el.categoria.innerHTML = "";
    el.categoria.appendChild(opcao("", "Selecione..."));
    const doTipo = estado.categorias.filter(c => c.tipo === estado.tipo && (c.ativo || String(c.id) === String(estado.inicial?.categoria_id)));
    doTipo.forEach(c => el.categoria.appendChild(opcao(String(c.id), c.ativo ? c.nome : `${c.nome} (inativa)`)));
    if (atual && doTipo.some(c => String(c.id) === atual)) el.categoria.value = atual;
  }

  function preencherPartes() {
    const receber = estado.tipo === "receber";
    el.rotuloParte.textContent = receber ? "Cliente (opcional)" : "Fornecedor (opcional)";
    const atual = el.parte.value;
    el.parte.innerHTML = "";
    el.parte.appendChild(opcao("", receber ? "Sem cliente" : "Sem fornecedor"));
    const lista = receber ? estado.clientes : estado.fornecedores;
    const atualId = receber ? estado.titulo?.cliente_id : estado.titulo?.fornecedor_id;
    const nomeAtual = receber ? estado.titulo?.cliente_nome : estado.titulo?.fornecedor_nome;
    lista.forEach(p => el.parte.appendChild(opcao(String(p.id), p.nome)));
    if (atualId && !lista.some(p => p.id === atualId)) el.parte.appendChild(opcao(String(atualId), `${nomeAtual || `#${atualId}`} (inativo)`));
    if (atual && [...el.parte.options].some(o => o.value === atual)) el.parte.value = atual;
  }

  function escolherTipo(tipo) {
    estado.tipo = tipo;
    el.tipo.querySelectorAll("[data-tipo]").forEach(b => {
      const ativo = b.dataset.tipo === tipo;
      b.classList.toggle("segmentado__opcao--ativa", ativo);
      b.setAttribute("aria-checked", String(ativo));
    });
    el.parte.value = "";
    el.categoria.value = "";
    preencherCategorias();
    preencherPartes();
    limparErros();
  }

  function atualizarRepetir() {
    el.grupoMeses.hidden = !el.repetir.checked;
    atualizarPrevia();
  }

  function atualizarPrevia() {
    const meses = Number(el.meses.value);
    const c = centavos(el.valor.value);
    if (!el.repetir.checked || !dataValida(el.vencimento.value) || !Number.isInteger(meses) || meses < 2 || meses > 60) {
      el.previa.hidden = true;
      return;
    }
    const ultimo = somarMeses(el.vencimento.value, meses - 1);
    const valorTxt = c && c > 0 ? ` de ${formatarMoeda(c / 100)}` : "";
    const total = c && c > 0 ? ` Total: ${formatarMoeda((c * meses) / 100)}.` : "";
    el.previa.textContent = `Serão criados ${meses} lançamentos${valorTxt}, de ${formatarData(el.vencimento.value)} a ${formatarData(ultimo)}.${total}`;
    el.previa.hidden = false;
  }

  function instantaneo() {
    return JSON.stringify([
      estado.tipo, el.descricao.value.trim(), el.categoria.value, el.parte.value, el.valor.value,
      el.vencimento.value, el.repetir.checked, el.meses.value
    ]);
  }

  function estaAlterado() {
    return Boolean(estado) && !enviando && instantaneo() !== estado.instantaneoInicial;
  }

  function erro(grupo, mensagem) {
    const g = el.overlay.querySelector(`#lanc-grupo-${grupo}`);
    g.classList.add("invalido");
    el.overlay.querySelector(`#lanc-erro-${grupo}`).textContent = mensagem;
  }

  function limparErros() {
    el.overlay.querySelectorAll(".campo-form.invalido").forEach(g => g.classList.remove("invalido"));
  }

  // Valida e devolve { payload } ou { foco }.
  function validar() {
    limparErros();
    let foco = null;
    const marcar = (grupo, msg, campo) => { erro(grupo, msg); if (!foco) foco = campo; };

    const descricao = el.descricao.value.trim();
    if (!descricao) marcar("descricao", "Informe a descrição.", el.descricao);
    else if (descricao.length > 255) marcar("descricao", "No máximo 255 caracteres.", el.descricao);

    if (!el.categoria.value) marcar("categoria", "Escolha a categoria.", el.categoria);

    const c = centavos(el.valor.value);
    if (c === null || c <= 0) marcar("valor", "Informe um valor maior que zero.", el.valor);
    else if (c > LIMITE_VALOR_CENTAVOS) marcar("valor", "Valor acima do permitido.", el.valor);

    if (!dataValida(el.vencimento.value)) marcar("vencimento", "Informe uma data de vencimento válida.", el.vencimento);

    let meses = null;
    if (estado.modo === "novo" && el.repetir.checked) {
      meses = Number(el.meses.value);
      if (!Number.isInteger(meses) || meses < 2 || meses > 60) marcar("meses", "Informe de 2 a 60 meses.", el.meses);
    }
    if (foco) return { foco };

    const parteId = el.parte.value ? Number(el.parte.value) : null;
    const campoParte = estado.tipo === "receber" ? "cliente_id" : "fornecedor_id";

    if (estado.modo === "novo") {
      const payload = {
        tipo: estado.tipo, descricao, categoria_id: Number(el.categoria.value),
        valor: c / 100, vencimento: el.vencimento.value
      };
      if (parteId) payload[campoParte] = parteId;
      if (meses) payload.repetir_meses = meses;
      return { payload };
    }

    // Edição: só o que mudou (o backend altera apenas os campos enviados).
    const t = estado.titulo;
    const payload = {};
    if (descricao !== (t.descricao || "")) payload.descricao = descricao;
    if (Number(el.categoria.value) !== t.categoria_id) payload.categoria_id = Number(el.categoria.value);
    if (c !== Math.round(Number(t.valor) * 100)) payload.valor = c / 100;
    if (el.vencimento.value !== t.vencimento) payload.vencimento = el.vencimento.value;
    if (parteId !== (t[campoParte] ?? null)) payload[campoParte] = parteId;
    return { payload };
  }

  function definirEnviando(valor) {
    enviando = valor;
    el.salvar.disabled = valor;
    el.cancelar.disabled = valor;
    el.salvar.textContent = valor ? "Salvando..." : (estado.modo === "novo" ? "Salvar lançamento" : "Salvar alterações");
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;
    const { payload, foco } = validar();
    if (foco) { toast.erro("Corrija os campos destacados."); foco.focus(); return; }

    if (estado.modo === "editar" && Object.keys(payload).length === 0) {
      toast.info("Nenhuma alteração para salvar.");
      fecharModal();
      return;
    }

    definirEnviando(true);
    try {
      let resultado;
      if (estado.modo === "novo") {
        resultado = await financeiroService.lancarAvulso(payload);
        toast.sucesso(resultado.length > 1
          ? `${resultado.length} lançamentos criados (um por mês).`
          : "Lançamento criado.");
      } else {
        resultado = await financeiroService.editarAvulso(estado.titulo.id, payload);
        toast.sucesso("Lançamento atualizado.");
      }
      const callback = estado.aoSalvar;
      enviando = false;
      fecharModal();
      if (callback) await callback(resultado);
    } catch (e) {
      definirEnviando(false);
      toast.erro(e.message);
    }
  }

  function fecharModal() {
    el.overlay.classList.remove("aberto");
    estado = null;
  }

  async function tentarFechar() {
    if (enviando || !estado) return;
    if (estaAlterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar alterações?",
        mensagem: "O que você preencheu neste lançamento será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    fecharModal();
  }

  async function abrir({ modo = "novo", titulo = null, tipoInicial = "pagar", aoSalvar = null } = {}) {
    montar();
    if (el.overlay.classList.contains("aberto")) return;
    estado = { modo, titulo, aoSalvar, tipo: modo === "editar" ? titulo.tipo : tipoInicial, categorias: [], clientes: [], fornecedores: [], inicial: titulo };
    enviando = false;
    limparErros();

    const editar = modo === "editar";
    el.titulo.textContent = editar ? "Editar lançamento" : "Novo lançamento";
    el.tipo.hidden = editar;
    el.tipoFixo.hidden = !editar;
    el.tipoFixo.textContent = editar ? (titulo.tipo === "pagar" ? "Conta a pagar (o tipo não pode ser alterado)." : "Conta a receber (o tipo não pode ser alterado).") : "";
    el.blocoRepetir.hidden = editar;
    el.form.reset();
    el.repetir.checked = false;
    el.meses.value = "12";
    el.grupoMeses.hidden = true;
    el.previa.hidden = true;
    el.salvar.disabled = true;
    el.salvar.textContent = "Carregando...";
    el.overlay.classList.add("aberto");

    try {
      const [categorias, clientes, fornecedores] = await Promise.all([
        categoriaFinanceiraService.listar({ incluirInativos: editar }),
        clienteService.listar(),
        fornecedorService.listar()
      ]);
      if (!estado) return;   // fechou enquanto carregava
      estado.categorias = categorias;
      estado.clientes = clientes;
      estado.fornecedores = fornecedores;
    } catch (e) {
      toast.erro(`Não foi possível carregar os dados do formulário. ${e.message}`);
      fecharModal();
      return;
    }

    escolherTipo(estado.tipo);
    if (editar) {
      el.descricao.value = titulo.descricao || "";
      el.categoria.value = String(titulo.categoria_id);
      el.parte.value = String((titulo.tipo === "receber" ? titulo.cliente_id : titulo.fornecedor_id) ?? "");
      el.valor.value = numeroParaMoeda(Number(titulo.valor));
      el.vencimento.value = titulo.vencimento;
    }
    estado.instantaneoInicial = instantaneo();
    definirEnviando(false);
    el.descricao.focus();
  }

  return { abrir };
})();
