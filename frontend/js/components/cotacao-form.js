// Formulário de cotação, usado em "Nova cotação" (modo "criar") e em "Editar" no detalhe (modo "editar").
// Regras que espelham o backend (routes/cotacao.py e schemas/cotacao.py):
//  - Compra: fornecedor ativo; preço do item pode ficar "a definir" até o fornecedor responder; sem desconto;
//    tem "Entrega prevista" (passa para o pedido gerado).
//  - Venda: cliente ativo; preço obrigatório; desconto digitado em % e enviado em reais; tem endereço de entrega
//    (endereço ativo do próprio cliente; vazio = retirada).
//  - Nenhum produto repetido; quantidade com até 3 casas; validade não pode estar no passado.
//  - Tipo, fornecedor e cliente não mudam depois de criada a cotação.
//
// Uso:
//   const form = criarFormularioCotacao(document.getElementById("cotacao-form"), { modo: "criar", tipoInicial: "compra" });
//   await form.pronto;
//   const problema = form.validar();  const payload = form.montarPayload();  form.alterado();

function criarFormularioCotacao(raiz, { modo = "criar", tipoInicial = "compra", cotacao = null, aoMudar = () => {} } = {}) {
  const editando = modo === "editar";

  let tipo = editando ? cotacao.tipo : (tipoInicial === "venda" ? "venda" : "compra");
  let produtos = [];              // os que podem aparecer nas linhas, em ordem alfabética
  let produtosPorId = {};
  let siglasPorUnidade = {};
  let fornecedores = [];
  let clientes = [];
  let formas = [];
  let itens = [];                 // [{ uid, produto_id, quantidade, preco, desconto, obs, erro, orig }]
  let proximoUid = 1;
  let exigirPrecos = false;
  let requisicaoPrevia = 0;
  let temporizadorPrevia = null;
  let instantaneoInicial = "";

  raiz.innerHTML = `
    <section class="cartao">
      <h2 class="cartao__titulo">Dados da Cotação</h2>
      <div class="cartao-grade">

        <div class="campo-form cartao-grade--cheia" id="cf-grupo-tipo">
          <label>Tipo *</label>
          <div class="seletor-tipo" role="radiogroup" aria-label="Tipo da cotação">
            <button type="button" class="seletor-tipo__opcao" data-tipo="compra" role="radio">
              <strong>Compra</strong><span>Peço o preço a um fornecedor</span>
            </button>
            <button type="button" class="seletor-tipo__opcao" data-tipo="venda" role="radio">
              <strong>Venda</strong><span>Ofereço um preço a um cliente</span>
            </button>
          </div>
        </div>

        <div class="campo-form" id="cf-grupo-parte">
          <label for="cf-parte" id="cf-rotulo-parte">Fornecedor *</label>
          <select id="cf-parte" disabled><option value="">Carregando...</option></select>
          <span class="campo-erro-msg" id="cf-erro-parte">Selecione o fornecedor.</span>
        </div>

        <div class="campo-form" id="cf-grupo-forma">
          <label for="cf-forma">Forma de Pagamento</label>
          <select id="cf-forma" disabled><option value="">Carregando...</option></select>
          <span class="dica">Necessária para aprovar a cotação.</span>
          <div class="previa-pagamento" id="cf-previa" hidden></div>
        </div>

        <div class="campo-form" id="cf-grupo-validade">
          <label for="cf-validade">Validade</label>
          <input type="date" id="cf-validade">
          <span class="dica dica--aviso" id="cf-dica-validade" hidden></span>
        </div>

        <div class="campo-form" id="cf-grupo-entrega-prevista">
          <label for="cf-entrega-prevista">Entrega prevista</label>
          <input type="date" id="cf-entrega-prevista">
        </div>

        <div class="campo-form cartao-grade--cheia" id="cf-grupo-endereco">
          <label for="cf-endereco">Endereço de entrega</label>
          <select id="cf-endereco" disabled><option value="">Selecione o cliente primeiro</option></select>
          <span class="dica" id="cf-dica-endereco" hidden></span>
        </div>

        <div class="campo-form cartao-grade--cheia">
          <label for="cf-observacao">Observação</label>
          <textarea id="cf-observacao" maxlength="255"></textarea>
          <span class="contador-caracteres" id="cf-contador">0/255</span>
        </div>

      </div>
    </section>

    <section class="cartao">
      <div class="cartao__topo">
        <h2 class="cartao__titulo">Itens da Cotação</h2>
        <button type="button" class="botao-secundario" id="cf-adicionar" disabled>+ Adicionar item</button>
      </div>
      <table class="tabela-itens-pedido">
        <thead>
          <tr>
            <th class="col-produto">Produto</th>
            <th class="col-qtd">Qtd.</th>
            <th class="col-preco" id="cf-th-preco">R$ Un.</th>
            <th class="col-desc" id="cf-th-desc">Desc (%)</th>
            <th class="col-subtotal">Subtotal</th>
            <th class="col-acao"><span class="sr-only">Remover</span></th>
          </tr>
        </thead>
        <tbody id="cf-corpo"></tbody>
      </table>
      <div class="itens-vazio-novo" id="cf-vazio">Nenhum item adicionado. Use “+ Adicionar item”.</div>
      <div class="total-pedido">
        <span class="total-pedido__rotulo">Total da Cotação</span>
        <span class="total-pedido__valor" id="cf-total">R$ 0,00</span>
      </div>
    </section>`;

  const $ = (id) => raiz.querySelector("#" + id);
  const el = {
    grupoTipo: $("cf-grupo-tipo"), opcoesTipo: raiz.querySelectorAll(".seletor-tipo__opcao"),
    grupoParte: $("cf-grupo-parte"), rotuloParte: $("cf-rotulo-parte"), parte: $("cf-parte"), erroParte: $("cf-erro-parte"),
    forma: $("cf-forma"), previa: $("cf-previa"),
    grupoValidade: $("cf-grupo-validade"), validade: $("cf-validade"), dicaValidade: $("cf-dica-validade"),
    grupoEntregaPrevista: $("cf-grupo-entrega-prevista"), entregaPrevista: $("cf-entrega-prevista"),
    grupoEndereco: $("cf-grupo-endereco"), endereco: $("cf-endereco"), dicaEndereco: $("cf-dica-endereco"),
    observacao: $("cf-observacao"), contador: $("cf-contador"),
    adicionar: $("cf-adicionar"), thPreco: $("cf-th-preco"), thDesc: $("cf-th-desc"),
    corpo: $("cf-corpo"), vazio: $("cf-vazio"), total: $("cf-total")
  };

  const ehVenda = () => tipo === "venda";
  const arredondar2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const itemPorUid = (uid) => itens.find(i => i.uid === Number(uid));
  // Produto com embalagem é cotado na embalagem (ex.: Pote); o estoque continua na unidade base (ex.: L).
  const siglaDe = (produto) => siglaNegociacao(produto, siglasPorUnidade);
  const qtdNaBase = (produto, qtd) => Math.round(Number(qtd) * fatorEmbalagem(produto) * 1000) / 1000;
  const disponivelDe = (produto) => Number(produto?.estoque_disponivel ?? 0);

  function hojeTexto() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function casasDecimaisOk(valor, casas) {
    const fator = 10 ** casas;
    return Math.abs(valor * fator - Math.round(valor * fator)) < 1e-6;
  }

  // ---------- Cálculos ----------

  const temPreco = (item) => item.preco !== "" && item.preco !== null && !isNaN(Number(item.preco));

  function descontoEmReais(item) {
    const qtd = Number(item.quantidade) || 0;
    const preco = Number(item.preco) || 0;
    // Item que veio da cotação e não foi mexido mantém o desconto em reais original (evita erro de arredondamento do %)
    const o = item.orig;
    if (o && item.desconto === o.descontoTexto && item.quantidade === o.quantidade && item.preco === o.preco) return o.descontoReais;
    const pct = Math.min(Math.max(Number(item.desconto) || 0, 0), 100);
    return arredondar2(qtd * preco * pct / 100);
  }

  function subtotalDoItem(item) {
    if (!temPreco(item)) return null;
    const bruto = (Number(item.quantidade) || 0) * Number(item.preco);
    const desconto = ehVenda() ? descontoEmReais(item) : 0;
    return Math.max(0, arredondar2(bruto - desconto));
  }

  // null enquanto faltar preço em algum item (como o backend)
  function totalDaCotacao() {
    let soma = 0;
    for (const item of itens) {
      const s = subtotalDoItem(item);
      if (s === null) return null;
      soma += s;
    }
    return arredondar2(soma);
  }

  // ---------- Parte (fornecedor / cliente) ----------

  function montarParte() {
    const lista = ehVenda() ? clientes : fornecedores;
    const nome = ehVenda() ? "cliente" : "fornecedor";
    el.rotuloParte.textContent = ehVenda() ? "Cliente *" : "Fornecedor *";
    el.erroParte.textContent = `Selecione o ${nome}.`;

    if (editando) {
      const atual = lista.find(p => p.id === (ehVenda() ? cotacao.cliente_id : cotacao.fornecedor_id));
      el.parte.innerHTML = `<option value="">${escaparHtml(atual ? atual.nome : "—")}</option>`;
      el.parte.disabled = true;
      return;
    }
    const ativos = lista.filter(p => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (ativos.length === 0) {
      el.parte.innerHTML = `<option value="">Nenhum ${nome} ativo cadastrado</option>`;
      el.parte.disabled = true;
      return;
    }
    el.parte.innerHTML = '<option value="">Selecione...</option>' +
      ativos.map(p => `<option value="${p.id}">${escaparHtml(p.nome)}</option>`).join("");
    el.parte.disabled = false;
  }

  function montarEndereco() {
    el.dicaEndereco.hidden = true;
    if (!ehVenda()) return;

    const clienteId = editando ? cotacao.cliente_id : Number(el.parte.value);
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) {
      el.endereco.innerHTML = '<option value="">Selecione o cliente primeiro</option>';
      el.endereco.disabled = true;
      return;
    }

    const enderecos = (cliente.enderecos || []).slice();
    const rotuloTipo = (e) => (e.tipo === "principal" ? "Principal" : "Entrega");
    let opcoes = '<option value="">Retirada (sem entrega)</option>' +
      enderecos.map(e => `<option value="${e.id}">${rotuloTipo(e)} — ${escaparHtml(formatarEndereco(e))}</option>`).join("");

    // Endereço já gravado na cotação que foi desativado depois: continua visível para não "sumir" sem aviso.
    const gravado = editando ? cotacao.endereco_entrega : null;
    if (gravado && !enderecos.some(e => e.id === gravado.id)) {
      opcoes += `<option value="${gravado.id}">${rotuloTipo(gravado)} — ${escaparHtml(formatarEndereco(gravado))} (inativo)</option>`;
    }
    el.endereco.innerHTML = opcoes;
    el.endereco.disabled = false;

    if (editando) {
      el.endereco.value = cotacao.endereco_entrega_id ? String(cotacao.endereco_entrega_id) : "";
    } else {
      const principal = enderecos.find(e => e.tipo === "principal");
      el.endereco.value = principal ? String(principal.id) : "";
      if (enderecos.length === 0) {
        el.dicaEndereco.textContent = "Este cliente não tem endereço ativo cadastrado; a cotação será de retirada.";
        el.dicaEndereco.hidden = false;
      }
    }
  }

  // ---------- Tipo ----------

  function aplicarTipo() {
    el.opcoesTipo.forEach(b => {
      const ativo = b.dataset.tipo === tipo;
      b.classList.toggle("seletor-tipo__opcao--ativa", ativo);
      b.setAttribute("aria-checked", String(ativo));
    });
    el.grupoTipo.hidden = editando;
    el.grupoEntregaPrevista.hidden = ehVenda();
    el.grupoEndereco.hidden = !ehVenda();
    el.thDesc.hidden = !ehVenda();
    el.thPreco.textContent = ehVenda() ? "R$ Un." : "R$ Un. (preço cotado)";
    montarParte();
    montarEndereco();
    montarProdutos();
    reconstruirLinhas();
    atualizarTotalEVazio();
  }

  function montarProdutos() {
    const usados = new Set(editando ? cotacao.itens.map(i => i.produto_id) : []);
    produtos = (produtosTodos || [])
      .filter(p => (p.ativo && (!ehVenda() || p.e_vendavel)) || usados.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    produtosPorId = Object.fromEntries(produtos.map(p => [p.id, p]));
  }
  let produtosTodos = [];

  // ---------- Forma de pagamento: prévia ----------

  function montarFormas() {
    const ativas = formas.filter(f => f.ativo || (editando && f.id === cotacao.forma_pagamento_id));
    if (ativas.length === 0) {
      el.forma.innerHTML = '<option value="">Nenhuma forma de pagamento ativa</option>';
      el.forma.disabled = true;
      return;
    }
    el.forma.innerHTML = '<option value="">Definir depois</option>' +
      ativas.map(f => `<option value="${f.id}">${escaparHtml(f.descricao)}${f.ativo ? "" : " (inativa)"}</option>`).join("");
    el.forma.disabled = false;
  }

  function textoPrazo(dias) {
    const quando = ehVenda() ? "a confirmação do pedido" : "a data do pedido";
    if (dias === 0) return ehVenda() ? "no ato da confirmação" : "na data do pedido";
    return `${dias} ${dias === 1 ? "dia" : "dias"} após ${quando}`;
  }

  function renderizarPrevia(forma, simulacao) {
    const linhas = [];
    if (simulacao) {
      const prazos = Object.fromEntries(forma.parcelas.map(p => [p.numero, p.prazo_dias]));
      const total = simulacao.parcelas.length;
      simulacao.parcelas.forEach(p => {
        const rotulo = total === 1 ? "À vista" : `Parcela ${p.numero}/${total}`;
        linhas.push(`<span><strong>${rotulo}</strong>: ${formatarMoeda(p.valor)} — ${textoPrazo(prazos[p.numero] ?? 0)}</span>`);
      });
    } else {
      const total = forma.parcelas.length;
      forma.parcelas.forEach(p => {
        const rotulo = total === 1 ? "À vista" : `Parcela ${p.numero}/${total}`;
        linhas.push(`<span><strong>${rotulo}</strong>: ${formatarNumero(p.percentual)}% — ${textoPrazo(p.prazo_dias)}</span>`);
      });
    }
    linhas.push(ehVenda()
      ? "<span>As contas a receber nascem quando o pedido gerado for confirmado.</span>"
      : "<span>As contas a pagar nascem quando a cotação for aprovada e o pedido de compra for criado.</span>");
    el.previa.innerHTML = linhas.join("");
    el.previa.hidden = false;
  }

  async function atualizarPrevia() {
    const forma = formas.find(f => String(f.id) === el.forma.value);
    const minha = ++requisicaoPrevia;
    if (!forma) { el.previa.hidden = true; return; }
    const total = totalDaCotacao();
    if (!total || total <= 0) { renderizarPrevia(forma, null); return; }
    try {
      const simulacao = await formaPagamentoService.simular(forma.id, total);
      if (minha !== requisicaoPrevia) return;
      renderizarPrevia(forma, simulacao);
    } catch (erro) {
      if (minha === requisicaoPrevia) renderizarPrevia(forma, null);   // a prévia é só uma ajuda
    }
  }

  function agendarPrevia() {
    clearTimeout(temporizadorPrevia);
    temporizadorPrevia = setTimeout(atualizarPrevia, 350);
  }

  // ---------- Itens ----------

  function rotuloOpcao(p) {
    const sigla = siglaDe(p);
    let texto = sigla ? `${p.nome} (${sigla})` : p.nome;
    if (!p.ativo) texto += " — inativo";
    else if (ehVenda()) {
      const disp = disponivelDe(p);
      texto += disp <= 0 ? " — sem estoque" : ` — disp. ${textoEstoque(disp, p, siglasPorUnidade)}`;
    }
    return texto;
  }

  function montarOpcoes(select, selecionado, usadosPorOutros) {
    const opcoes = ['<option value="">Selecione...</option>'];
    produtos.forEach(p => {
      const ehSelecionado = String(p.id) === String(selecionado);
      const bloquear = !ehSelecionado && (usadosPorOutros.has(p.id) || !p.ativo);
      opcoes.push(`<option value="${p.id}"${ehSelecionado ? " selected" : ""}${bloquear ? " disabled" : ""}>${escaparHtml(rotuloOpcao(p))}</option>`);
    });
    select.innerHTML = opcoes.join("");
  }

  // Um produto não pode aparecer em duas linhas: some das demais.
  function sincronizarSelects() {
    el.corpo.querySelectorAll("tr[data-uid]").forEach(tr => {
      const uid = Number(tr.dataset.uid);
      const item = itemPorUid(uid);
      const usados = new Set(itens.filter(i => i.uid !== uid && i.produto_id).map(i => Number(i.produto_id)));
      montarOpcoes(tr.querySelector('[data-campo="produto_id"]'), item.produto_id, usados);
    });
  }

  function criarLinha(item) {
    const tr = document.createElement("tr");
    tr.dataset.uid = item.uid;
    tr.innerHTML = `
      <td class="col-produto">
        <select data-campo="produto_id" aria-label="Produto"></select>
        <input type="text" class="item-obs" data-campo="obs" maxlength="255" placeholder="Observação do item (opcional)" aria-label="Observação do item" value="${escaparHtml(item.obs)}">
        <span class="item-aviso" hidden></span>
        <span class="item-dica item-dica--aviso" data-dica-estoque hidden></span>
      </td>
      <td class="col-qtd">
        <input type="number" data-campo="quantidade" min="0" step="0.001" inputmode="decimal" aria-label="Quantidade" value="${escaparHtml(item.quantidade)}">
        <span class="item-dica" data-dica-conversao hidden></span>
      </td>
      <td class="col-preco">
        <input type="number" data-campo="preco" min="0" step="0.01" inputmode="decimal" aria-label="Preço unitário" placeholder="${ehVenda() ? "0,00" : "a definir"}" value="${escaparHtml(item.preco)}">
        <span class="item-dica item-dica--aviso" data-dica-preco hidden></span>
      </td>
      <td class="col-desc"${ehVenda() ? "" : " hidden"}>
        <input type="number" data-campo="desconto" min="0" max="100" step="0.0001" inputmode="decimal" aria-label="Desconto em porcentagem" value="${escaparHtml(item.desconto)}">
      </td>
      <td class="col-subtotal" data-subtotal>—</td>
      <td class="col-acao">
        <button type="button" class="botao-lixeira" data-remover aria-label="Remover item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>`;
    return tr;
  }

  // Atualiza só o que depende do valor digitado (sem recriar a linha, para o cursor não sair do campo).
  function atualizarLinha(tr) {
    const item = itemPorUid(tr.dataset.uid);
    if (!item) return;
    const produto = produtosPorId[item.produto_id];

    const subtotal = subtotalDoItem(item);
    tr.querySelector("[data-subtotal]").textContent = subtotal === null ? "—" : formatarMoeda(subtotal);

    const aviso = tr.querySelector(".item-aviso");
    aviso.textContent = item.erro || "";
    aviso.hidden = !item.erro;
    tr.classList.toggle("item-invalido", Boolean(item.erro));

    // venda acima do estoque: só avisa (a cotação não reserva estoque; a trava real é na aprovação)
    const dicaEstoque = tr.querySelector("[data-dica-estoque]");
    const acima = ehVenda() && produto && produto.ativo && qtdNaBase(produto, item.quantidade) > disponivelDe(produto);
    dicaEstoque.textContent = acima
      ? `Acima do estoque disponível (${textoEstoque(disponivelDe(produto), produto, siglasPorUnidade)}): a aprovação pode ser recusada.`
      : "";
    dicaEstoque.hidden = !acima;

    // produto com embalagem: mostra quanto a quantidade dá na unidade base
    const conversao = tr.querySelector("[data-dica-conversao]");
    const comEmbalagem = produto && fatorEmbalagem(produto) !== 1;
    conversao.textContent = comEmbalagem ? textoQuantidadeItem(Number(item.quantidade) || 0, produto.fator_embalagem, produto, siglasPorUnidade) : "";
    conversao.hidden = !comEmbalagem;

    // preço diferente do cadastro (que é por embalagem): só uma referência
    const dicaPreco = tr.querySelector("[data-dica-preco]");
    const referencia = produto ? (ehVenda() ? produto.preco_venda : produto.preco_custo) : null;
    const diferente = referencia != null && temPreco(item) && Math.abs(Number(item.preco) - Number(referencia)) > 0.004;
    dicaPreco.textContent = diferente ? `${ehVenda() ? "Preço de tabela" : "Custo cadastrado"}: ${formatarMoeda(referencia)}` : "";
    dicaPreco.hidden = !diferente;
  }

  function atualizarTotalEVazio() {
    const total = totalDaCotacao();
    if (itens.length === 0) {
      el.total.textContent = formatarMoeda(0);
      el.total.classList.remove("total-pedido__valor--pendente");
    } else if (total === null) {
      el.total.textContent = "A definir (faltam preços)";
      el.total.classList.add("total-pedido__valor--pendente");
    } else {
      el.total.textContent = formatarMoeda(total);
      el.total.classList.remove("total-pedido__valor--pendente");
    }
    el.vazio.hidden = itens.length > 0;
    agendarPrevia();
    aoMudar();
  }

  function reconstruirLinhas() {
    el.corpo.innerHTML = "";
    itens.forEach(item => el.corpo.appendChild(criarLinha(item)));
    sincronizarSelects();
    el.corpo.querySelectorAll("tr[data-uid]").forEach(atualizarLinha);
  }

  function adicionarLinha({ focar = true } = {}) {
    const item = { uid: proximoUid++, produto_id: "", quantidade: "1", preco: "", desconto: "0", obs: "", erro: "", orig: null };
    itens.push(item);
    const tr = criarLinha(item);
    el.corpo.appendChild(tr);
    sincronizarSelects();
    atualizarLinha(tr);
    atualizarTotalEVazio();
    if (focar) tr.querySelector('[data-campo="produto_id"]').focus();
  }

  el.corpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const tr = evento.target.closest("tr[data-uid]");
    if (!campo || !tr) return;
    const item = itemPorUid(tr.dataset.uid);
    item[campo] = evento.target.value;
    item.erro = "";
    evento.target.classList.remove("campo-invalido");

    if (campo === "produto_id") {
      const produto = produtosPorId[item.produto_id];
      // Venda já sugere o preço de tabela; compra espera a resposta do fornecedor (a referência aparece como dica)
      item.preco = ehVenda() && produto && produto.preco_venda != null ? Number(produto.preco_venda).toFixed(2) : "";
      tr.querySelector('[data-campo="preco"]').value = item.preco;
      sincronizarSelects();
    }
    atualizarLinha(tr);
    atualizarTotalEVazio();
  });

  el.corpo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao) return;
    const tr = botao.closest("tr[data-uid]");
    itens = itens.filter(i => i.uid !== Number(tr.dataset.uid));
    tr.remove();
    sincronizarSelects();
    atualizarTotalEVazio();
  });

  el.adicionar.addEventListener("click", () => adicionarLinha());

  // ---------- Eventos dos demais campos ----------

  el.opcoesTipo.forEach(botao => {
    botao.addEventListener("click", () => {
      if (editando || botao.dataset.tipo === tipo) return;
      tipo = botao.dataset.tipo;
      // O preço sugerido e as regras mudam com o tipo: recomeça os itens para não carregar valores do outro tipo.
      itens = [];
      proximoUid = 1;
      aplicarTipo();
      adicionarLinha({ focar: false });
    });
  });

  el.parte.addEventListener("change", () => {
    el.grupoParte.classList.remove("invalido");
    montarEndereco();
    aoMudar();
  });

  el.forma.addEventListener("change", () => { atualizarPrevia(); aoMudar(); });
  el.endereco.addEventListener("change", aoMudar);
  el.entregaPrevista.addEventListener("change", aoMudar);

  el.validade.addEventListener("change", () => {
    const passada = Boolean(el.validade.value) && el.validade.value < hojeTexto();
    el.dicaValidade.textContent = passada ? "A validade não pode estar no passado." : "";
    el.dicaValidade.hidden = !passada;
    aoMudar();
  });

  el.observacao.addEventListener("input", () => {
    el.contador.textContent = `${el.observacao.value.length}/255`;
    aoMudar();
  });

  // ---------- Validação e payload ----------

  function validar() {
    let primeiroErro = null;
    const registrar = (mensagem, foco) => { if (!primeiroErro) primeiroErro = { mensagem, foco }; };

    if (!editando) {
      el.grupoParte.classList.toggle("invalido", !el.parte.value);
      if (!el.parte.value) registrar(ehVenda() ? "Selecione o cliente." : "Selecione o fornecedor.", el.parte);
    }

    const validadeMudou = !editando || el.validade.value !== (cotacao.validade || "");
    if (el.validade.value && validadeMudou && el.validade.value < hojeTexto()) {
      el.dicaValidade.textContent = "A validade não pode estar no passado.";
      el.dicaValidade.hidden = false;
      registrar("A validade não pode estar no passado.", el.validade);
    }

    if (itens.length === 0) registrar("Adicione ao menos um item à cotação.", el.adicionar);

    itens.forEach(item => {
      const tr = el.corpo.querySelector(`tr[data-uid="${item.uid}"]`);
      const qtd = Number(item.quantidade);
      const preco = Number(item.preco);
      const pct = Number(item.desconto);
      let erro = "";
      let campo = null;

      if (!item.produto_id) { erro = "Selecione o produto."; campo = "produto_id"; }
      else if (item.quantidade === "" || !(qtd > 0)) { erro = "Informe uma quantidade maior que zero."; campo = "quantidade"; }
      else if (!casasDecimaisOk(qtd, 3)) { erro = "A quantidade aceita no máximo 3 casas decimais."; campo = "quantidade"; }
      else if (temPreco(item) && !(preco >= 0)) { erro = "O preço não pode ser negativo."; campo = "preco"; }
      else if (!temPreco(item) && (ehVenda() || exigirPrecos)) {
        erro = ehVenda() ? "Informe o preço unitário." : "Informe o preço cotado pelo fornecedor.";
        campo = "preco";
      }
      else if (ehVenda() && item.desconto !== "" && !(pct >= 0 && pct <= 100)) { erro = "O desconto deve ficar entre 0 e 100%."; campo = "desconto"; }

      item.erro = erro;
      atualizarLinha(tr);
      if (campo) {
        tr.querySelector(`[data-campo="${campo}"]`).classList.add("campo-invalido");
        registrar(erro, tr.querySelector(`[data-campo="${campo}"]`));
      }
    });

    return primeiroErro;
  }

  function montarItensPayload() {
    return itens.map(item => ({
      produto_id: Number(item.produto_id),
      quantidade: Number(item.quantidade),
      preco_unitario: temPreco(item) ? Number(item.preco) : null,
      desconto: ehVenda() && temPreco(item) ? descontoEmReais(item) : 0,
      observacao: item.obs.trim() || null
    }));
  }

  // criar: o corpo completo do POST. editar: só o que o PUT aceita, e só o que mudou nos campos sensíveis
  // (validade no passado e endereço desativado fariam o servidor recusar um PUT que não mexeu neles).
  function montarPayload() {
    const comum = {
      forma_pagamento_id: el.forma.value ? Number(el.forma.value) : null,
      observacao: el.observacao.value.trim() || null,
      itens: montarItensPayload()
    };

    if (!editando) {
      return {
        tipo,
        fornecedor_id: ehVenda() ? null : Number(el.parte.value),
        cliente_id: ehVenda() ? Number(el.parte.value) : null,
        validade: el.validade.value || null,
        endereco_entrega_id: ehVenda() && el.endereco.value ? Number(el.endereco.value) : null,
        data_entrega_prevista: ehVenda() ? null : (el.entregaPrevista.value || null),
        ...comum
      };
    }

    const dados = { ...comum };
    if (el.validade.value !== (cotacao.validade || "")) dados.validade = el.validade.value || null;
    if (ehVenda()) {
      const atual = el.endereco.value ? Number(el.endereco.value) : null;
      if (atual !== (cotacao.endereco_entrega_id ?? null)) dados.endereco_entrega_id = atual;
    } else if (el.entregaPrevista.value !== (cotacao.data_entrega_prevista || "")) {
      dados.data_entrega_prevista = el.entregaPrevista.value || null;
    }
    return dados;
  }

  function instantaneo() {
    return JSON.stringify([tipo, el.parte.value, el.forma.value, el.validade.value, el.entregaPrevista.value,
      el.endereco.value, el.observacao.value.trim(), itens.map(i => [i.produto_id, i.quantidade, i.preco, i.desconto, i.obs.trim()])]);
  }

  // ---------- Preenchimento (editar) ----------

  function preencherDaCotacao() {
    el.forma.value = cotacao.forma_pagamento_id ? String(cotacao.forma_pagamento_id) : "";
    el.validade.value = cotacao.validade || "";
    el.entregaPrevista.value = cotacao.data_entrega_prevista || "";
    el.observacao.value = cotacao.observacao || "";
    el.contador.textContent = `${el.observacao.value.length}/255`;

    itens = cotacao.itens.slice().sort((a, b) => a.id - b.id).map(i => {
      const qtd = String(Number(i.quantidade));
      const preco = i.preco_unitario === null || i.preco_unitario === undefined ? "" : Number(i.preco_unitario).toFixed(2);
      const bruto = Number(i.quantidade) * Number(i.preco_unitario || 0);
      const pct = bruto > 0 && Number(i.desconto) > 0 ? String(Math.round((Number(i.desconto) / bruto) * 1e6) / 1e4) : "0";
      return {
        uid: proximoUid++, produto_id: i.produto_id, quantidade: qtd, preco, desconto: pct, obs: i.observacao || "", erro: "",
        orig: { quantidade: qtd, preco, descontoTexto: pct, descontoReais: Number(i.desconto) || 0 }
      };
    });
    reconstruirLinhas();
  }

  // ---------- Carga inicial ----------

  const pronto = (async () => {
    try {
      const [prods, forns, clis, fms, unidades] = await Promise.all([
        produtoService.listar({ incluirInativos: true }),
        fornecedorService.listar({ incluirInativos: true }),
        clienteService.listar({ incluirInativos: true }),
        formaPagamentoService.listar({ incluirInativos: true }),
        unidadeMedidaService.listar({ incluirInativos: true })
      ]);
      produtosTodos = prods;
      fornecedores = forns;
      clientes = clis;
      formas = fms;
      siglasPorUnidade = Object.fromEntries(unidades.map(u => [u.id, u.sigla]));

      montarFormas();
      aplicarTipo();
      el.adicionar.disabled = false;
      if (editando) {
        preencherDaCotacao();
        atualizarTotalEVazio();
      } else {
        adicionarLinha({ focar: false });
      }
      instantaneoInicial = instantaneo();
    } catch (erro) {
      toast.erro(`Não foi possível carregar os dados do formulário. ${erro.message}`);
      el.parte.innerHTML = '<option value="">Falha ao carregar</option>';
      el.forma.innerHTML = '<option value="">Falha ao carregar</option>';
      throw erro;
    }
  })();

  return {
    pronto,
    tipo: () => tipo,
    validar,
    montarPayload,
    alterado: () => instantaneo() !== instantaneoInicial,
    // "Registrar resposta do fornecedor": todos os preços passam a ser obrigatórios
    exigirPrecos: (valor) => { exigirPrecos = Boolean(valor); },
    focarPrimeiroPrecoVazio() {
      const tr = itens.map(i => i).filter(i => !temPreco(i)).map(i => el.corpo.querySelector(`tr[data-uid="${i.uid}"]`))[0];
      const campo = tr ? tr.querySelector('[data-campo="preco"]') : el.corpo.querySelector('[data-campo="preco"]');
      if (campo) campo.focus();
    },
    focar: () => { (editando ? el.forma : el.parte).focus(); }
  };
}
