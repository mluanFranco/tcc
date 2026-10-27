// Novo Pedido de Venda.
// Regras que espelham o backend (core/pedidos.py):
//  - só produtos ativos e vendáveis (inclui os que também são insumo);
//  - a quantidade é digitada na embalagem do produto (ex.: 2 Pote) e, convertida para a unidade base
//    (quantidade × fator), não pode passar do estoque disponível (atual − reservado);
//  - o desconto é guardado em reais; na tela é digitado em % e convertido ao enviar;
//  - a forma de pagamento é obrigatória (é dela que saem as parcelas do contas a receber);
//  - o endereço de entrega, se informado, precisa ser um endereço ativo do próprio cliente.

let produtosVendaveis = [];     // ativos e vendáveis, em ordem alfabética
let produtosPorId = {};
let siglasPorUnidade = {};      // { unidade_medida_id: "kg" }
let clientesAtivos = [];        // cada um já traz seus endereços ativos
let formasAtivas = [];
let itens = [];                 // [{ uid, produto_id, quantidade, preco, desconto, erro }]
let proximoUid = 1;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("vendas.editar")) return;

  const el = {
    form: document.getElementById("form-pedido"),
    botaoSalvar: document.getElementById("botao-salvar"),
    botaoCancelar: document.getElementById("botao-cancelar"),
    linkVoltar: document.getElementById("link-voltar"),
    botaoAdicionar: document.getElementById("botao-adicionar-item"),
    campoCliente: document.getElementById("campo-cliente"),
    campoForma: document.getElementById("campo-forma-pagamento"),
    campoEntrega: document.getElementById("campo-entrega"),
    dicaEntrega: document.getElementById("dica-entrega"),
    campoObservacao: document.getElementById("campo-observacao"),
    contadorObservacao: document.getElementById("contador-observacao"),
    previa: document.getElementById("previa-pagamento"),
    corpo: document.getElementById("tabela-itens-corpo"),
    vazio: document.getElementById("itens-vazio"),
    total: document.getElementById("total-exibicao"),
    grupoCliente: document.getElementById("grupo-cliente"),
    grupoForma: document.getElementById("grupo-forma")
  };

  let salvando = false;
  let saindo = false;
  let requisicaoPrevia = 0;
  let temporizadorPrevia = null;

  // ---------- Cálculos (centavos, como o backend) ----------

  const arredondar2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function subtotalDoItem(item) {
    const qtd = Number(item.quantidade) || 0;
    const preco = Number(item.preco) || 0;
    const pct = Math.min(Math.max(Number(item.desconto) || 0, 0), 100);
    const bruto = qtd * preco;
    return Math.max(0, arredondar2(bruto - arredondar2(bruto * pct / 100)));
  }

  function totalDoPedido() {
    return arredondar2(itens.reduce((soma, item) => soma + subtotalDoItem(item), 0));
  }

  const disponivelDe = (produto) => Number(produto?.estoque_disponivel ?? 0);
  // A quantidade é digitada na embalagem do produto (ex.: Pote); o estoque está na unidade base (ex.: L).
  const qtdNaBase = (produto, qtd) => Math.round(Number(qtd) * fatorEmbalagem(produto) * 1000) / 1000;
  const excedeEstoque = (produto, qtd) => produto && qtdNaBase(produto, qtd) > disponivelDe(produto);
  const itemPorUid = (uid) => itens.find(i => i.uid === Number(uid));

  // ---------- Cliente e endereço de entrega ----------

  function montarClientes() {
    if (clientesAtivos.length === 0) {
      el.campoCliente.innerHTML = '<option value="">Nenhum cliente ativo cadastrado</option>';
      el.campoCliente.disabled = true;
      return;
    }
    el.campoCliente.innerHTML = '<option value="">Selecione...</option>' +
      clientesAtivos.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join("");
    el.campoCliente.disabled = false;
  }

  function montarEntrega() {
    const cliente = clientesAtivos.find(c => String(c.id) === el.campoCliente.value);
    el.dicaEntrega.hidden = true;

    if (!cliente) {
      el.campoEntrega.innerHTML = '<option value="">Selecione o cliente primeiro</option>';
      el.campoEntrega.disabled = true;
      return;
    }

    const enderecos = cliente.enderecos || [];
    const rotuloTipo = (e) => (e.tipo === "principal" ? "Principal" : "Entrega");
    el.campoEntrega.innerHTML = '<option value="">Retirada (sem entrega)</option>' +
      enderecos.map(e => `<option value="${e.id}">${rotuloTipo(e)} — ${escaparHtml(formatarEndereco(e))}</option>`).join("");
    el.campoEntrega.disabled = false;

    // O endereço principal já vem escolhido; quem retira troca para "Retirada".
    const principal = enderecos.find(e => e.tipo === "principal");
    el.campoEntrega.value = principal ? String(principal.id) : "";

    if (enderecos.length === 0) {
      el.dicaEntrega.textContent = "Este cliente não tem endereço ativo cadastrado; o pedido será de retirada.";
      el.dicaEntrega.hidden = false;
    }
  }

  // ---------- Forma de pagamento: prévia das parcelas ----------

  function textoPrazo(dias) {
    if (dias === 0) return "no ato da confirmação";
    return `${dias} ${dias === 1 ? "dia" : "dias"} após a confirmação`;
  }

  function montarFormas() {
    if (formasAtivas.length === 0) {
      el.campoForma.innerHTML = '<option value="">Nenhuma forma de pagamento ativa</option>';
      el.campoForma.disabled = true;
      return;
    }
    el.campoForma.innerHTML = '<option value="">Selecione...</option>' +
      formasAtivas.map(f => `<option value="${f.id}">${escaparHtml(f.descricao)}</option>`).join("");
    el.campoForma.disabled = false;
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
    linhas.push('<span>As contas a receber são geradas quando o pedido é confirmado.</span>');
    el.previa.innerHTML = linhas.join("");
    el.previa.hidden = false;
  }

  async function atualizarPrevia() {
    const forma = formasAtivas.find(f => String(f.id) === el.campoForma.value);
    const minha = ++requisicaoPrevia;
    if (!forma) {
      el.previa.hidden = true;
      return;
    }
    const total = totalDoPedido();
    if (total <= 0) {
      renderizarPrevia(forma, null);
      return;
    }
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

  function montarOpcoes(select, selecionado, usadosPorOutros) {
    const opcoes = ['<option value="">Selecione...</option>'];
    produtosVendaveis.forEach(p => {
      const disp = disponivelDe(p);
      const semEstoque = disp <= 0;
      const ehSelecionado = String(p.id) === String(selecionado);
      const bloquear = !ehSelecionado && (semEstoque || usadosPorOutros.has(p.id));
      const detalhe = semEstoque ? "sem estoque" : `disp. ${textoEstoque(disp, p, siglasPorUnidade)}`;
      opcoes.push(`<option value="${p.id}"${ehSelecionado ? " selected" : ""}${bloquear ? " disabled" : ""}>${escaparHtml(`${p.nome} — ${detalhe}`)}</option>`);
    });
    select.innerHTML = opcoes.join("");
  }

  // Um produto não pode aparecer em duas linhas: some das demais (a disponibilidade é por produto).
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
        <span class="item-aviso" hidden></span>
      </td>
      <td class="col-qtd">
        <input type="number" data-campo="quantidade" min="0" step="0.001" inputmode="decimal" aria-label="Quantidade" value="${escaparHtml(item.quantidade)}">
        <span class="item-dica" data-dica-conversao hidden></span>
      </td>
      <td class="col-preco">
        <input type="number" data-campo="preco" min="0" step="0.01" inputmode="decimal" aria-label="Preço unitário" placeholder="0,00" value="${escaparHtml(item.preco)}">
        <span class="item-dica item-dica--aviso" data-dica-preco hidden></span>
      </td>
      <td class="col-desc">
        <input type="number" data-campo="desconto" min="0" max="100" step="0.01" inputmode="decimal" aria-label="Desconto em porcentagem" value="${escaparHtml(item.desconto)}">
      </td>
      <td class="col-subtotal" data-subtotal>R$ 0,00</td>
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

    tr.querySelector("[data-subtotal]").textContent = formatarMoeda(subtotalDoItem(item));

    // aviso do produto: estoque tem prioridade sobre o erro de validação do último "Salvar"
    const aviso = tr.querySelector(".item-aviso");
    let mensagem = "";
    if (excedeEstoque(produto, item.quantidade)) {
      mensagem = `Quantidade acima do estoque disponível (${textoEstoque(disponivelDe(produto), produto, siglasPorUnidade)}).`;
    } else if (item.erro) {
      mensagem = item.erro;
    }
    aviso.textContent = mensagem;
    aviso.hidden = !mensagem;
    tr.classList.toggle("item-invalido", Boolean(mensagem));

    // produto com embalagem: mostra em que unidade a quantidade está e quanto dá na base
    const conversao = tr.querySelector("[data-dica-conversao]");
    const comEmbalagem = produto && fatorEmbalagem(produto) !== 1;
    conversao.textContent = comEmbalagem ? textoQuantidadeItem(Number(item.quantidade) || 0, produto.fator_embalagem, produto, siglasPorUnidade) : "";
    conversao.hidden = !comEmbalagem;

    // preço diferente do cadastro: só um aviso, o vendedor pode negociar
    const dica = tr.querySelector("[data-dica-preco]");
    const diferente = produto && produto.preco_venda != null && item.preco !== "" &&
      Math.abs(Number(item.preco) - Number(produto.preco_venda)) > 0.004;
    dica.textContent = diferente ? `Preço de tabela: ${formatarMoeda(produto.preco_venda)}` : "";
    dica.hidden = !diferente;
  }

  function atualizarTotalEVazio() {
    el.total.textContent = formatarMoeda(totalDoPedido());
    el.vazio.hidden = itens.length > 0;
    agendarPrevia();
  }

  function adicionarLinha({ focar = true } = {}) {
    const item = { uid: proximoUid++, produto_id: "", quantidade: "1", preco: "", desconto: "0", erro: "" };
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
      item.preco = produto && produto.preco_venda != null ? Number(produto.preco_venda).toFixed(2) : "";
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

  el.botaoAdicionar.addEventListener("click", () => adicionarLinha());

  // ---------- Validação e envio ----------

  function casasDecimaisOk(valor, casas) {
    const fator = 10 ** casas;
    return Math.abs(valor * fator - Math.round(valor * fator)) < 1e-6;
  }

  function validar() {
    let primeiroErro = null;
    const registrar = (mensagem, foco) => { if (!primeiroErro) primeiroErro = { mensagem, foco }; };

    el.grupoCliente.classList.toggle("invalido", !el.campoCliente.value);
    el.grupoForma.classList.toggle("invalido", !el.campoForma.value);
    if (!el.campoCliente.value) registrar("Selecione o cliente.", el.campoCliente);
    if (!el.campoForma.value) registrar("Selecione a forma de pagamento.", el.campoForma);

    if (itens.length === 0) registrar("Adicione ao menos um item ao pedido.", el.botaoAdicionar);

    itens.forEach(item => {
      const tr = el.corpo.querySelector(`tr[data-uid="${item.uid}"]`);
      const produto = produtosPorId[item.produto_id];
      const qtd = Number(item.quantidade);
      const preco = Number(item.preco);
      const pct = Number(item.desconto);
      let erro = "";
      let campo = null;

      if (!item.produto_id) { erro = "Selecione o produto."; campo = "produto_id"; }
      else if (item.quantidade === "" || !(qtd > 0)) { erro = "Informe uma quantidade maior que zero."; campo = "quantidade"; }
      else if (!casasDecimaisOk(qtd, 3)) { erro = "A quantidade aceita no máximo 3 casas decimais."; campo = "quantidade"; }
      else if (excedeEstoque(produto, qtd)) { campo = "quantidade"; erro = ""; }   // o aviso de estoque já aparece na linha
      else if (item.preco === "" || !(preco >= 0)) { erro = "Informe o preço unitário."; campo = "preco"; }
      else if (item.desconto !== "" && !(pct >= 0 && pct <= 100)) { erro = "O desconto deve ficar entre 0 e 100%."; campo = "desconto"; }

      item.erro = erro;
      atualizarLinha(tr);
      if (campo) {
        tr.querySelector(`[data-campo="${campo}"]`).classList.add("campo-invalido");
        registrar(erro || "Há item com quantidade acima do estoque disponível.", tr.querySelector(`[data-campo="${campo}"]`));
      }
    });

    return primeiroErro;
  }

  function montarPayload() {
    return {
      cliente_id: Number(el.campoCliente.value),
      forma_pagamento_id: Number(el.campoForma.value),
      endereco_entrega_id: el.campoEntrega.value ? Number(el.campoEntrega.value) : null,
      observacao: el.campoObservacao.value.trim() || null,
      itens: itens.map(item => {
        const qtd = Number(item.quantidade);
        const preco = Number(item.preco);
        const pct = Math.min(Math.max(Number(item.desconto) || 0, 0), 100);
        return {
          produto_id: Number(item.produto_id),
          quantidade: qtd,
          preco_unitario: preco,
          desconto: arredondar2(qtd * preco * pct / 100)    // o backend guarda o desconto em reais
        };
      })
    };
  }

  // Depois de um erro (ex.: outro pedido reservou o estoque), traz os saldos de novo sem perder o que foi digitado.
  async function atualizarEstoques() {
    try {
      const produtos = await produtoService.listar();
      definirProdutos(produtos);
      sincronizarSelects();
      el.corpo.querySelectorAll("tr[data-uid]").forEach(atualizarLinha);
    } catch (erro) { /* a mensagem do erro original já está na tela */ }
  }

  async function salvar() {
    if (salvando) return;
    const problema = validar();
    if (problema) {
      toast.erro(problema.mensagem);
      if (problema.foco && problema.foco.focus) problema.foco.focus();
      return;
    }

    salvando = true;
    el.botaoSalvar.disabled = true;
    el.botaoSalvar.textContent = "Salvando...";

    try {
      const criado = await pedidoVendaService.criar(montarPayload());
      saindo = true;
      window.location.href = `pedido-venda-detalhe.html?id=${criado.id}&novo=1`;
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      el.botaoSalvar.disabled = false;
      el.botaoSalvar.textContent = "Salvar Pedido";
      atualizarEstoques();
    }
  }

  el.form.addEventListener("submit", (e) => e.preventDefault());
  el.botaoSalvar.addEventListener("click", salvar);

  // ---------- Cancelar / sair ----------

  function pedidoFoiPreenchido() {
    return Boolean(el.campoCliente.value || el.campoForma.value || el.campoObservacao.value.trim() ||
      itens.some(i => i.produto_id));
  }

  async function sair(evento) {
    if (evento) evento.preventDefault();
    if (pedidoFoiPreenchido()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar este pedido?",
        mensagem: "Os dados preenchidos ainda não foram salvos e serão perdidos.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    saindo = true;
    window.location.href = "pedidos-venda.html";
  }

  el.botaoCancelar.addEventListener("click", sair);
  el.linkVoltar.addEventListener("click", sair);

  window.addEventListener("beforeunload", (evento) => {
    if (!saindo && !salvando && pedidoFoiPreenchido()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  // ---------- Demais campos ----------

  el.campoCliente.addEventListener("change", () => {
    el.grupoCliente.classList.remove("invalido");
    montarEntrega();
  });

  el.campoForma.addEventListener("change", () => {
    el.grupoForma.classList.remove("invalido");
    atualizarPrevia();
  });

  el.campoObservacao.addEventListener("input", () => {
    el.contadorObservacao.textContent = `${el.campoObservacao.value.length}/255`;
  });

  // ---------- Carga inicial ----------

  function definirProdutos(lista) {
    produtosVendaveis = lista
      .filter(p => p.ativo && p.e_vendavel)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    produtosPorId = Object.fromEntries(produtosVendaveis.map(p => [p.id, p]));
  }

  try {
    const [produtos, clientes, formas, unidades] = await Promise.all([
      produtoService.listar(),
      clienteService.listar(),
      formaPagamentoService.listar(),
      unidadeMedidaService.listar({ incluirInativos: true })
    ]);
    definirProdutos(produtos);
    clientesAtivos = clientes.filter(c => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    formasAtivas = formas.filter(f => f.ativo);
    siglasPorUnidade = Object.fromEntries(unidades.map(u => [u.id, u.sigla]));

    montarClientes();
    montarFormas();
    montarEntrega();
    el.botaoAdicionar.disabled = false;
    el.botaoSalvar.disabled = false;
    adicionarLinha({ focar: false });

    if (produtosVendaveis.length === 0) {
      toast.info("Não há produtos ativos e vendáveis cadastrados.");
    }
  } catch (erro) {
    toast.erro(`Não foi possível carregar os dados do pedido. ${erro.message}`);
    el.campoCliente.innerHTML = '<option value="">Falha ao carregar</option>';
    el.campoForma.innerHTML = '<option value="">Falha ao carregar</option>';
  }
});
