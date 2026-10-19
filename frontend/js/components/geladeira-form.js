// Modal de cadastro/edição de geladeira (usado na lista e no detalhe).
//   geladeiraForm.abrir({ geladeira: null, aoSalvar })       -> nova geladeira
//   geladeiraForm.abrir({ geladeira: {...}, aoSalvar })      -> edita a geladeira recebida da API
// aoSalvar(geladeiraSalva) é chamado depois que a API confirmou.
// Depende de: geladeiraService, clienteService, formatadores.js e feedback.js. O HTML é criado aqui, uma vez por página.

const geladeiraForm = (() => {
  const TIPOS = ["Freezer Horizontal", "Freezer Vertical", "Conservador", "Expositor"];
  let el = null;
  let estado = null;        // { geladeira, aoSalvar, instantaneoInicial }
  let enviando = false;
  let pedidoEnderecos = 0;  // descarta respostas antigas se o cliente for trocado rápido

  function montar() {
    if (el) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modal-geladeira";
    overlay.innerHTML = `
      <div class="modal modal--larga" role="dialog" aria-modal="true" aria-labelledby="gel-titulo-modal">
        <div class="modal__topo">
          <span class="modal__titulo" id="gel-titulo-modal">Nova geladeira</span>
          <button type="button" class="modal__fechar" id="gel-fechar" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form id="gel-form" novalidate>
          <div class="modal__corpo">

            <div class="campo-form" id="gel-grupo-cliente">
              <label for="gel-cliente">Cliente *</label>
              <select id="gel-cliente"></select>
              <span class="campo-erro-msg" id="gel-erro-cliente"></span>
            </div>

            <div class="campo-form" id="gel-grupo-endereco">
              <label for="gel-endereco">Endereço de instalação *</label>
              <select id="gel-endereco" disabled></select>
              <span class="campo-erro-msg" id="gel-erro-endereco"></span>
              <span class="gel-dica" id="gel-dica-endereco" hidden></span>
            </div>

            <div class="campo-form-linha">
              <div class="campo-form" id="gel-grupo-tipo">
                <label for="gel-tipo">Tipo *</label>
                <select id="gel-tipo"></select>
                <span class="campo-erro-msg" id="gel-erro-tipo"></span>
              </div>
              <div class="campo-form" id="gel-grupo-serie">
                <label for="gel-serie">Nº de série</label>
                <input type="text" id="gel-serie" maxlength="100" autocomplete="off">
                <span class="campo-erro-msg" id="gel-erro-serie"></span>
              </div>
            </div>

            <div class="campo-form-linha">
              <div class="campo-form">
                <label for="gel-marca">Marca</label>
                <input type="text" id="gel-marca" maxlength="50" autocomplete="off">
              </div>
              <div class="campo-form">
                <label for="gel-modelo">Modelo</label>
                <input type="text" id="gel-modelo" maxlength="100" autocomplete="off">
              </div>
            </div>

            <div class="campo-form gel-campo-data" id="gel-grupo-data">
              <label for="gel-data">Data de alocação</label>
              <input type="date" id="gel-data" min="2000-01-01" max="2100-12-31">
              <span class="campo-erro-msg" id="gel-erro-data"></span>
            </div>

          </div>
          <div class="modal__rodape">
            <button type="button" class="botao-secundario" id="gel-cancelar">Cancelar</button>
            <button type="submit" class="botao-primario" id="gel-salvar">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const q = (id) => overlay.querySelector(`#${id}`);
    el = {
      overlay, titulo: q("gel-titulo-modal"), fechar: q("gel-fechar"), cancelar: q("gel-cancelar"), salvar: q("gel-salvar"), form: q("gel-form"),
      cliente: q("gel-cliente"), endereco: q("gel-endereco"), tipo: q("gel-tipo"), serie: q("gel-serie"),
      marca: q("gel-marca"), modelo: q("gel-modelo"), data: q("gel-data"), dicaEndereco: q("gel-dica-endereco"),
      grupos: { cliente: q("gel-grupo-cliente"), endereco: q("gel-grupo-endereco"), tipo: q("gel-grupo-tipo"), serie: q("gel-grupo-serie"), data: q("gel-grupo-data") },
      erros: { cliente: q("gel-erro-cliente"), endereco: q("gel-erro-endereco"), tipo: q("gel-erro-tipo"), serie: q("gel-erro-serie"), data: q("gel-erro-data") }
    };

    el.form.addEventListener("submit", enviar);
    el.fechar.addEventListener("click", tentarFechar);
    el.cancelar.addEventListener("click", tentarFechar);
    el.overlay.addEventListener("mousedown", (e) => { if (e.target === el.overlay) tentarFechar(); });
    el.cliente.addEventListener("change", () => { limparErro("cliente"); carregarEnderecos(el.cliente.value, null); });
    el.endereco.addEventListener("change", () => limparErro("endereco"));
    el.tipo.addEventListener("change", () => limparErro("tipo"));
    el.serie.addEventListener("input", () => limparErro("serie"));
    el.data.addEventListener("input", () => limparErro("data"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.overlay.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) tentarFechar();
    });
    window.addEventListener("beforeunload", (e) => {
      if (el.overlay.classList.contains("aberto") && estaAlterado()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  // ---------- helpers ----------
  function opcao(valor, texto) {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  }

  function rotuloEndereco(e) {
    const tipo = e.tipo === "principal" ? "Principal" : "Entrega";
    const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
    const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
    return [tipo, rua, cidadeUf].filter(Boolean).join(" — ");
  }

  function instantaneo() {
    return JSON.stringify([el.cliente.value, el.endereco.value, el.tipo.value, el.serie.value.trim(), el.marca.value.trim(), el.modelo.value.trim(), el.data.value]);
  }
  const estaAlterado = () => !!estado && instantaneo() !== estado.instantaneoInicial;

  function limparErro(campo) {
    el.grupos[campo].classList.remove("invalido");
    el.erros[campo].textContent = "";
  }
  function limparErros() { Object.keys(el.grupos).forEach(limparErro); }
  function mostrarErro(campo, mensagem) {
    el.grupos[campo].classList.add("invalido");
    el.erros[campo].textContent = mensagem;
  }

  function definirEnviando(valor) {
    enviando = valor;
    el.salvar.disabled = valor;
    el.salvar.textContent = valor ? "Salvando..." : "Salvar";
  }

  function fecharModal() {
    el.overlay.classList.remove("aberto");
    estado = null;
    pedidoEnderecos++;
  }

  async function tentarFechar() {
    if (enviando || !estado) return;
    if (estaAlterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar alterações?",
        mensagem: "O que você preencheu nesta geladeira será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    fecharModal();
  }

  // ---------- campos ----------
  function preencherClientes(clientes, atual) {
    el.cliente.innerHTML = "";
    el.cliente.appendChild(opcao("", "Selecione..."));
    clientes.forEach(c => el.cliente.appendChild(opcao(String(c.id), c.nome)));
    if (atual && !clientes.some(c => c.id === atual.cliente_id)) {
      el.cliente.appendChild(opcao(String(atual.cliente_id), `${atual.cliente_nome || `#${atual.cliente_id}`} (inativo)`));
    }
  }

  function preencherTipos(atual) {
    el.tipo.innerHTML = "";
    el.tipo.appendChild(opcao("", "Selecione..."));
    const lista = atual && !TIPOS.includes(atual) ? [...TIPOS, atual] : TIPOS;
    lista.forEach(t => el.tipo.appendChild(opcao(t, t)));
  }

  // Carrega os endereços ativos do cliente. `selecionado` = endereço que deve ficar marcado (edição).
  async function carregarEnderecos(clienteId, selecionado) {
    const meu = ++pedidoEnderecos;
    el.dicaEndereco.hidden = true;
    el.endereco.innerHTML = "";
    if (!clienteId) {
      el.endereco.appendChild(opcao("", "Escolha o cliente primeiro"));
      el.endereco.disabled = true;
      return;
    }
    el.endereco.appendChild(opcao("", "Carregando endereços..."));
    el.endereco.disabled = true;
    let enderecos;
    try {
      enderecos = await clienteService.listarEnderecos(clienteId);
    } catch (e) {
      if (meu !== pedidoEnderecos) return;
      el.endereco.innerHTML = "";
      el.endereco.appendChild(opcao("", "Não foi possível carregar"));
      toast.erro(`Não foi possível carregar os endereços do cliente. ${e.message}`);
      return;
    }
    if (meu !== pedidoEnderecos) return;

    el.endereco.innerHTML = "";
    el.endereco.appendChild(opcao("", enderecos.length ? "Selecione..." : "Cliente sem endereço ativo"));
    enderecos.forEach(e => el.endereco.appendChild(opcao(String(e.id), rotuloEndereco(e))));
    let ativoPreSelecionado = false;
    if (selecionado) {
      if (enderecos.some(e => e.id === selecionado.id)) {
        el.endereco.value = String(selecionado.id);
        ativoPreSelecionado = true;
      } else {
        el.endereco.appendChild(opcao(String(selecionado.id), `${rotuloEndereco(selecionado)} (inativo)`));
        el.endereco.value = String(selecionado.id);
        el.dicaEndereco.textContent = "Este endereço foi desativado no cadastro do cliente. Escolha outro, se a geladeira mudou de lugar.";
        el.dicaEndereco.hidden = false;
        ativoPreSelecionado = true;
      }
    } else if (enderecos.length === 1) {
      el.endereco.value = String(enderecos[0].id);
    }
    if (!enderecos.length) {
      el.dicaEndereco.textContent = "Cadastre um endereço para este cliente em Cadastros → Clientes antes de alocar a geladeira.";
      el.dicaEndereco.hidden = false;
    }
    el.endereco.disabled = enderecos.length === 0 && !ativoPreSelecionado;
  }

  // ---------- envio ----------
  function validar() {
    limparErros();
    let primeiro = null;
    const falha = (campo, msg, foco) => { mostrarErro(campo, msg); if (!primeiro) primeiro = foco; };
    if (!el.cliente.value) falha("cliente", "Selecione o cliente.", el.cliente);
    if (!el.endereco.value) falha("endereco", el.cliente.value ? "Selecione o endereço onde a geladeira ficará instalada." : "Escolha o cliente para ver os endereços.", el.endereco.disabled ? el.cliente : el.endereco);
    if (!el.tipo.value) falha("tipo", "Selecione o tipo.", el.tipo);
    if (el.data.value) {
      const ano = Number(el.data.value.slice(0, 4));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(el.data.value) || ano < 2000 || ano > 2100) falha("data", "Informe uma data válida.", el.data);
    }
    if (primeiro) primeiro.focus();
    return !primeiro;
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando || !estado || !validar()) return;
    const edicao = estado.geladeira;
    const dados = {
      cliente_id: Number(el.cliente.value),
      endereco_id: Number(el.endereco.value),
      tipo: el.tipo.value,
      marca: el.marca.value.trim() || null,
      modelo: el.modelo.value.trim() || null,
      numero_serie: el.serie.value.trim() || null,
      data_alocacao: el.data.value || null
    };
    definirEnviando(true);
    try {
      const salva = edicao ? await geladeiraService.atualizar(edicao.id, dados) : await geladeiraService.criar(dados);
      const aoSalvar = estado.aoSalvar;
      fecharModal();
      definirEnviando(false);
      toast.sucesso(edicao ? "Geladeira atualizada." : "Geladeira cadastrada.");
      if (aoSalvar) await aoSalvar(salva);
    } catch (erro) {
      definirEnviando(false);
      if (/s[ée]rie/i.test(erro.message)) {
        mostrarErro("serie", erro.message);
        el.serie.focus();
      } else {
        toast.erro(erro.message);
      }
    }
  }

  async function abrir({ geladeira = null, aoSalvar = null } = {}) {
    montar();
    if (el.overlay.classList.contains("aberto")) return;
    estado = { geladeira, aoSalvar, instantaneoInicial: "" };
    definirEnviando(false);
    limparErros();
    el.form.reset();
    el.titulo.textContent = geladeira ? "Editar geladeira" : "Nova geladeira";
    el.dicaEndereco.hidden = true;
    el.endereco.innerHTML = "";
    el.endereco.appendChild(opcao("", "Escolha o cliente primeiro"));
    el.endereco.disabled = true;
    el.salvar.disabled = true;
    el.salvar.textContent = "Carregando...";
    el.overlay.classList.add("aberto");

    let clientes;
    try {
      clientes = await clienteService.listar();
    } catch (e) {
      toast.erro(`Não foi possível carregar os clientes. ${e.message}`);
      fecharModal();
      return;
    }
    if (!estado) return;   // fechou enquanto carregava

    preencherClientes(clientes, geladeira);
    preencherTipos(geladeira ? geladeira.tipo : null);
    if (geladeira) {
      el.cliente.value = String(geladeira.cliente_id);
      el.tipo.value = geladeira.tipo;
      el.serie.value = geladeira.numero_serie || "";
      el.marca.value = geladeira.marca || "";
      el.modelo.value = geladeira.modelo || "";
      el.data.value = geladeira.data_alocacao ? String(geladeira.data_alocacao).slice(0, 10) : "";
      await carregarEnderecos(geladeira.cliente_id, geladeira.endereco || null);
      if (!estado) return;
      if (!geladeira.endereco_id) {
        el.dicaEndereco.textContent = "Esta geladeira foi cadastrada sem endereço de instalação. Escolha onde ela está para completar o cadastro.";
        el.dicaEndereco.hidden = false;
        el.endereco.disabled = el.endereco.options.length <= 1;
      }
    }
    estado.instantaneoInicial = instantaneo();
    definirEnviando(false);
    el.cliente.focus();
  }

  return { abrir };
})();
