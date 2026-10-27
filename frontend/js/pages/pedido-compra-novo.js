// Novo Pedido de Compra.
// Regras que espelham o backend (core/pedidos.py → registrar_pedido_compra):
//  - fornecedor ativo e forma de pagamento são obrigatórios (da forma saem as parcelas do contas a pagar);
//  - só produtos ativos (insumos e vendáveis: compra serve aos dois) e sem repetir produto;
//  - não há checagem de estoque (comprar não consome estoque) nem desconto por item;
//  - as contas a pagar nascem junto com o pedido, contando os prazos a partir de hoje;
//  - o estoque só aumenta depois, quando o recebimento é registrado.

let produtosCompraveis = [];    // ativos, em ordem alfabética
let produtosPorId = {};
let siglasPorUnidade = {};      // { unidade_medida_id: "kg" }
let fornecedoresAtivos = [];
let formasAtivas = [];
let itens = [];                 // [{ uid, produto_id, quantidade, preco, erro }]
let proximoUid = 1;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("compras.editar")) return;

  const el = {
    form: document.getElementById("form-pedido"),
    botaoSalvar: document.getElementById("botao-salvar"),
    botaoCancelar: document.getElementById("botao-cancelar"),
    linkVoltar: document.getElementById("link-voltar"),
    botaoAdicionar: document.getElementById("botao-adicionar-item"),
    campoFornecedor: document.getElementById("campo-fornecedor"),
    campoForma: document.getElementById("campo-forma-pagamento"),
    campoEntrega: document.getElementById("campo-entrega"),
    dicaEntrega: document.getElementById("dica-entrega"),
    campoObservacao: document.getElementById("campo-observacao"),
    contadorObservacao: document.getElementById("contador-observacao"),
    previa: document.getElementById("previa-pagamento"),
    corpo: document.getElementById("tabela-itens-corpo"),
    vazio: document.getElementById("itens-vazio"),
    total: document.getElementById("total-exibicao"),
    grupoFornecedor: document.getElementById("grupo-fornecedor"),
    grupoForma: document.getElementById("grupo-forma")
  };

  let salvando = false;
  let saindo = false;
  let requisicaoPrevia = 0;
  let temporizadorPrevia = null;

  // ---------- Cálculos (centavos, como o backend) ----------

  const arredondar2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function subtotalDoItem(item) {
    return arredondar2((Number(item.quantidade) || 0) * (Number(item.preco) || 0));
  }

  function totalDoPedido() {
    return arredondar2(itens.reduce((soma, item) => soma + subtotalDoItem(item), 0));
  }

  // Produto com embalagem é comprado na embalagem (ex.: Pote); sem embalagem, na unidade base.
  const siglaDe = (produto) => siglaNegociacao(produto, siglasPorUnidade);
  const itemPorUid = (uid) => itens.find(i => i.uid === Number(uid));

  function hojeTexto() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- Fornecedor e forma de pagamento ----------

  function montarFornecedores() {
    if (fornecedoresAtivos.length === 0) {
      el.campoFornecedor.innerHTML = '<option value="">Nenhum fornecedor ativo cadastrado</option>';
      el.campoFornecedor.disabled = true;
      return;
    }
    el.campoFornecedor.innerHTML = '<option value="">Selecione...</option>' +
      fornecedoresAtivos.map(f => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");
    el.campoFornecedor.disabled = false;
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

  function textoPrazo(dias) {
    if (dias === 0) return "hoje, na criação do pedido";
    return `${dias} ${dias === 1 ? "dia" : "dias"} após a data do pedido`;
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
    linhas.push("<span>As contas a pagar são geradas assim que o pedido é salvo.</span>");
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
    produtosCompraveis.forEach(p => {
      const ehSelecionado = String(p.id) === String(selecionado);
      const bloquear = !ehSelecionado && usadosPorOutros.has(p.id);
      const sigla = siglaDe(p);
      opcoes.push(`<option value="${p.id}"${ehSelecionado ? " selected" : ""}${bloquear ? " disabled" : ""}>${escaparHtml(sigla ? `${p.nome} (${sigla})` : p.nome)}</option>`);
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

    const aviso = tr.querySelector(".item-aviso");
    aviso.textContent = item.erro || "";
    aviso.hidden = !item.erro;
    tr.classList.toggle("item-invalido", Boolean(item.erro));

    // produto com embalagem: mostra quanto entra no estoque, na unidade base
    const conversao = tr.querySelector("[data-dica-conversao]");
    const comEmbalagem = produto && fatorEmbalagem(produto) !== 1;
    conversao.textContent = comEmbalagem ? textoQuantidadeItem(Number(item.quantidade) || 0, produto.fator_embalagem, produto, siglasPorUnidade) : "";
    conversao.hidden = !comEmbalagem;

    // preço diferente do custo cadastrado (que é por embalagem): só um aviso (o fornecedor pode ter reajustado)
    const dica = tr.querySelector("[data-dica-preco]");
    const custo = produto && produto.preco_custo != null ? Number(produto.preco_custo) : null;
    const diferente = custo !== null && item.preco !== "" && Math.abs(Number(item.preco) - custo) > 0.004;
    dica.textContent = diferente ? `Custo cadastrado: ${formatarMoeda(custo)}` : "";
    dica.hidden = !diferente;
  }

  function atualizarTotalEVazio() {
    el.total.textContent = formatarMoeda(totalDoPedido());
    el.vazio.hidden = itens.length > 0;
    agendarPrevia();
  }

  function adicionarLinha({ focar = true } = {}) {
    const item = { uid: proximoUid++, produto_id: "", quantidade: "1", preco: "", erro: "" };
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
      item.preco = produto && produto.preco_custo != null ? Number(produto.preco_custo).toFixed(2) : "";
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

    el.grupoFornecedor.classList.toggle("invalido", !el.campoFornecedor.value);
    el.grupoForma.classList.toggle("invalido", !el.campoForma.value);
    if (!el.campoFornecedor.value) registrar("Selecione o fornecedor.", el.campoFornecedor);
    if (!el.campoForma.value) registrar("Selecione a forma de pagamento.", el.campoForma);

    if (itens.length === 0) registrar("Adicione ao menos um item ao pedido.", el.botaoAdicionar);

    itens.forEach(item => {
      const tr = el.corpo.querySelector(`tr[data-uid="${item.uid}"]`);
      const qtd = Number(item.quantidade);
      const preco = Number(item.preco);
      let erro = "";
      let campo = null;

      if (!item.produto_id) { erro = "Selecione o produto."; campo = "produto_id"; }
      else if (item.quantidade === "" || !(qtd > 0)) { erro = "Informe uma quantidade maior que zero."; campo = "quantidade"; }
      else if (!casasDecimaisOk(qtd, 3)) { erro = "A quantidade aceita no máximo 3 casas decimais."; campo = "quantidade"; }
      else if (item.preco === "" || !(preco >= 0)) { erro = "Informe o preço unitário."; campo = "preco"; }

      item.erro = erro;
      atualizarLinha(tr);
      if (campo) {
        tr.querySelector(`[data-campo="${campo}"]`).classList.add("campo-invalido");
        registrar(erro, tr.querySelector(`[data-campo="${campo}"]`));
      }
    });

    return primeiroErro;
  }

  function montarPayload() {
    return {
      fornecedor_id: Number(el.campoFornecedor.value),
      forma_pagamento_id: Number(el.campoForma.value),
      data_entrega_prevista: el.campoEntrega.value || null,
      observacao: el.campoObservacao.value.trim() || null,
      itens: itens.map(item => ({
        produto_id: Number(item.produto_id),
        quantidade: Number(item.quantidade),
        preco_unitario: Number(item.preco)
      }))
    };
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
      const criado = await pedidoCompraService.criar(montarPayload());
      saindo = true;
      window.location.href = `pedido-compra-detalhe.html?id=${criado.id}&novo=1`;
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      el.botaoSalvar.disabled = false;
      el.botaoSalvar.textContent = "Salvar Pedido";
    }
  }

  el.form.addEventListener("submit", (e) => e.preventDefault());
  el.botaoSalvar.addEventListener("click", salvar);

  // ---------- Cancelar / sair ----------

  function pedidoFoiPreenchido() {
    return Boolean(el.campoFornecedor.value || el.campoForma.value || el.campoEntrega.value ||
      el.campoObservacao.value.trim() || itens.some(i => i.produto_id));
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
    window.location.href = "pedidos-compra.html";
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

  el.campoFornecedor.addEventListener("change", () => el.grupoFornecedor.classList.remove("invalido"));

  el.campoForma.addEventListener("change", () => {
    el.grupoForma.classList.remove("invalido");
    atualizarPrevia();
  });

  // Data no passado não é bloqueada (o pedido pode ser lançado depois do fato), só avisada.
  el.campoEntrega.addEventListener("change", () => {
    const passada = Boolean(el.campoEntrega.value) && el.campoEntrega.value < hojeTexto();
    el.dicaEntrega.textContent = passada ? "Esta data já passou; o pedido será exibido como atrasado." : "";
    el.dicaEntrega.hidden = !passada;
  });

  el.campoObservacao.addEventListener("input", () => {
    el.contadorObservacao.textContent = `${el.campoObservacao.value.length}/255`;
  });

  // ---------- Carga inicial ----------

  try {
    const [produtos, fornecedores, formas, unidades] = await Promise.all([
      produtoService.listar(),
      fornecedorService.listar(),
      formaPagamentoService.listar(),
      unidadeMedidaService.listar({ incluirInativos: true })
    ]);
    produtosCompraveis = produtos
      .filter(p => p.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    produtosPorId = Object.fromEntries(produtosCompraveis.map(p => [p.id, p]));
    fornecedoresAtivos = fornecedores.filter(f => f.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    formasAtivas = formas.filter(f => f.ativo);
    siglasPorUnidade = Object.fromEntries(unidades.map(u => [u.id, u.sigla]));

    montarFornecedores();
    montarFormas();
    el.botaoAdicionar.disabled = false;
    el.botaoSalvar.disabled = false;
    adicionarLinha({ focar: false });

    if (produtosCompraveis.length === 0) {
      toast.info("Não há produtos ativos cadastrados.");
    }
  } catch (erro) {
    toast.erro(`Não foi possível carregar os dados do pedido. ${erro.message}`);
    el.campoFornecedor.innerHTML = '<option value="">Falha ao carregar</option>';
    el.campoForma.innerHTML = '<option value="">Falha ao carregar</option>';
  }
});
