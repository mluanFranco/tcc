// Lógica da tela de detalhe de Pedido de Compra.
// Sem ?id na URL: modo de criação (cabeçalho + itens editáveis).
// Com ?id na URL: carrega o pedido existente. Editável apenas se status === "pendente"
// E ainda não recebeu nada — uma vez que o primeiro recebimento parcial ocorre,
// os itens deixam de ser editáveis (só se registra recebimento, não se edita a quantidade pedida).

let pedidoAtual = null;
let produtosDisponiveis = [];
let fornecedoresDisponiveis = [];
let formasPagamentoDisponiveis = [];
let itensDoFormulario = []; // [{ produto_id, quantidade, preco_unitario }]

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = params.get("id");

  const elementos = {
    titulo: document.getElementById("detalhe-titulo"),
    badgeStatus: document.getElementById("badge-status"),
    botaoVoltar: document.getElementById("botao-voltar"),
    campoFornecedor: document.getElementById("campo-fornecedor"),
    campoFormaPagamento: document.getElementById("campo-forma-pagamento"),
    campoDataEntrega: document.getElementById("campo-data-entrega"),
    campoObservacao: document.getElementById("campo-observacao"),
    cabecalhoItens: document.getElementById("cabecalho-itens"),
    tabelaItensCorpo: document.getElementById("tabela-itens-corpo"),
    itensVazio: document.getElementById("itens-vazio"),
    botaoAdicionarItem: document.getElementById("botao-adicionar-item"),
    totalExibicao: document.getElementById("total-exibicao"),
    acoesContainer: document.getElementById("acoes-container"),
    modalRecebimentoOverlay: document.getElementById("modal-recebimento"),
    modalRecebimentoFechar: document.getElementById("modal-recebimento-fechar"),
    modalRecebimentoCancelar: document.getElementById("modal-recebimento-cancelar"),
    modalRecebimentoConfirmar: document.getElementById("modal-recebimento-confirmar"),
    tabelaRecebimentoCorpo: document.getElementById("tabela-recebimento-corpo")
  };

  function formatarMoeda(numero) {
    return `R$ ${Number(numero || 0).toFixed(2).replace(".", ",")}`;
  }

  async function carregarDadosDeApoio() {
    [produtosDisponiveis, fornecedoresDisponiveis, formasPagamentoDisponiveis] = await Promise.all([
      produtoService.listar(),
      fornecedorService.listar(),
      formaPagamentoService.listar()
    ]);

    elementos.campoFornecedor.innerHTML = '<option value="">Selecione um fornecedor...</option>' +
      fornecedoresDisponiveis.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");

    elementos.campoFormaPagamento.innerHTML = '<option value="">Selecione...</option>' +
      formasPagamentoDisponiveis.map(fp => `<option value="${fp.id}">${fp.descricao}</option>`).join("");
  }

  function produtoPorId(id) {
    return produtosDisponiveis.find(p => p.id === Number(id));
  }

  function calcularSubtotalItem(item) {
    return (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
  }

  function calcularTotal() {
    return itensDoFormulario.reduce((soma, item) => soma + calcularSubtotalItem(item), 0);
  }

  // Em modo de criação não há ainda recebimento — uma vez que QUALQUER recebimento
  // parcial foi registrado, a quantidade pedida do item não pode mais ser editada,
  // pois alteraria a base de cálculo do que já foi recebido.
  function modoSomenteLeitura() {
    if (!pedidoAtual) return false;
    if (pedidoAtual.status !== "pendente") return true;
    return pedidoAtual.itens.some(item => item.quantidade_recebida > 0);
  }

  function renderizarItens() {
    const modoLeitura = modoSomenteLeitura();
    const exibirProgresso = !!pedidoAtual;

    // Cabeçalho muda conforme exibe ou não a coluna de progresso de recebimento
    elementos.cabecalhoItens.innerHTML = `
      <th>Produto</th>
      <th class="coluna-qtd">Qtd. pedida</th>
      ${exibirProgresso ? '<th class="coluna-qtd">Recebido</th>' : ""}
      <th class="coluna-preco">Preço unit.</th>
      <th class="coluna-subtotal">Subtotal</th>
      <th class="coluna-acao"></th>
    `;

    if (itensDoFormulario.length === 0) {
      elementos.tabelaItensCorpo.innerHTML = "";
      elementos.itensVazio.style.display = "block";
    } else {
      elementos.itensVazio.style.display = "none";

      elementos.tabelaItensCorpo.innerHTML = itensDoFormulario.map((item, index) => {
        const produtoSelecionado = produtoPorId(item.produto_id);
        const nomeProduto = produtoSelecionado ? produtoSelecionado.nome : `Produto #${item.produto_id}`;

        const colunaProgresso = exibirProgresso ? `
          <td>
            <div class="recebimento-progresso">
              <div class="barra-progresso">
                <div class="barra-progresso__preenchimento" style="width: ${Math.min(100, (item.quantidade_recebida / item.quantidade) * 100)}%;"></div>
              </div>
              <span>${item.quantidade_recebida}/${item.quantidade}</span>
            </div>
          </td>
        ` : "";

        if (modoLeitura) {
          return `
            <tr>
              <td>${nomeProduto}</td>
              <td>${item.quantidade}</td>
              ${colunaProgresso}
              <td>${formatarMoeda(item.preco_unitario)}</td>
              <td class="subtotal-exibicao">${formatarMoeda(calcularSubtotalItem(item))}</td>
              <td></td>
            </tr>
          `;
        }

        const opcoesProduto = produtosDisponiveis.map(p =>
          `<option value="${p.id}" ${Number(item.produto_id) === p.id ? "selected" : ""}>${p.nome}</option>`
        ).join("");

        return `
          <tr>
            <td>
              <select data-index="${index}" data-campo="produto_id">
                <option value="">Selecione...</option>
                ${opcoesProduto}
              </select>
            </td>
            <td class="coluna-qtd">
              <input type="number" min="1" data-index="${index}" data-campo="quantidade" value="${item.quantidade}">
            </td>
            ${colunaProgresso}
            <td class="coluna-preco">
              <input type="number" min="0" step="0.01" data-index="${index}" data-campo="preco_unitario" value="${item.preco_unitario}">
            </td>
            <td class="coluna-subtotal subtotal-exibicao">${formatarMoeda(calcularSubtotalItem(item))}</td>
            <td class="coluna-acao">
              <button type="button" class="botao-remover-item" data-remover="${index}" aria-label="Remover item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }

    elementos.totalExibicao.textContent = formatarMoeda(calcularTotal());
  }

  function adicionarLinhaItem() {
    itensDoFormulario.push({ produto_id: "", quantidade: 1, preco_unitario: 0 });
    renderizarItens();
  }

  elementos.tabelaItensCorpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const index = evento.target.dataset.index;
    if (campo === undefined || index === undefined) return;

    itensDoFormulario[index][campo] = evento.target.value;

    if (campo === "produto_id") {
      const produto = produtoPorId(evento.target.value);
      if (produto) {
        itensDoFormulario[index].preco_unitario = produto.preco_custo;
      }
    }

    renderizarItens();
  });

  elementos.tabelaItensCorpo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-remover]");
    if (!botao) return;
    itensDoFormulario.splice(Number(botao.dataset.remover), 1);
    renderizarItens();
  });

  function renderizarAcoes() {
    elementos.acoesContainer.innerHTML = "";

    if (!pedidoAtual) {
      elementos.acoesContainer.innerHTML = `<button class="botao-primario" id="botao-salvar-pedido">Salvar pedido</button>`;
      document.getElementById("botao-salvar-pedido").addEventListener("click", salvarPedido);
      return;
    }

    if (pedidoAtual.status === "pendente") {
      elementos.acoesContainer.innerHTML = `
        <button class="botao-perigo" id="botao-cancelar-pedido">Cancelar pedido</button>
        <button class="botao-sucesso" id="botao-abrir-recebimento">Registrar recebimento</button>
      `;
      document.getElementById("botao-cancelar-pedido").addEventListener("click", cancelarPedido);
      document.getElementById("botao-abrir-recebimento").addEventListener("click", abrirModalRecebimento);
    }

    if (pedidoAtual.status === "recebido") {
      elementos.acoesContainer.innerHTML = `<button class="botao-perigo" id="botao-cancelar-pedido">Cancelar pedido</button>`;
      document.getElementById("botao-cancelar-pedido").addEventListener("click", cancelarPedido);
    }
  }

  async function cancelarPedido() {
    if (!confirm("Cancelar este pedido? O estoque já recebido (se houver) será estornado. Esta ação não pode ser desfeita.")) return;

    try {
      pedidoAtual = await pedidoCompraService.cancelar(pedidoAtual.id);
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function abrirModalRecebimento() {
    const itensComRestante = pedidoAtual.itens.filter(item => item.quantidade_recebida < item.quantidade);

    elementos.tabelaRecebimentoCorpo.innerHTML = itensComRestante.map(item => {
      const produto = produtoPorId(item.produto_id);
      const restante = item.quantidade - item.quantidade_recebida;
      return `
        <tr>
          <td>${produto ? produto.nome : `Produto #${item.produto_id}`}</td>
          <td class="coluna-qtd">${restante}</td>
          <td class="coluna-qtd">
            <input type="number" min="0" max="${restante}" value="0" data-item-id="${item.id}" data-restante="${restante}">
          </td>
        </tr>
      `;
    }).join("");

    elementos.modalRecebimentoOverlay.classList.add("aberto");
  }

  function fecharModalRecebimento() {
    elementos.modalRecebimentoOverlay.classList.remove("aberto");
  }

  async function confirmarRecebimento() {
    const inputs = elementos.tabelaRecebimentoCorpo.querySelectorAll("input[data-item-id]");

    const itensRecebidos = [];
    for (const input of inputs) {
      const valor = parseInt(input.value, 10) || 0;
      const restante = parseInt(input.dataset.restante, 10);

      if (valor < 0 || valor > restante) {
        alert(`Quantidade inválida: o valor não pode ser negativo ou maior que o restante (${restante}).`);
        return;
      }

      if (valor > 0) {
        itensRecebidos.push({
          item_id: parseInt(input.dataset.itemId, 10),
          quantidade_recebida_agora: valor
        });
      }
    }

    if (itensRecebidos.length === 0) {
      alert("Informe ao menos uma quantidade recebida maior que zero.");
      return;
    }

    elementos.modalRecebimentoConfirmar.disabled = true;
    elementos.modalRecebimentoConfirmar.textContent = "Registrando...";

    try {
      pedidoAtual = await pedidoCompraService.registrarRecebimento(pedidoAtual.id, itensRecebidos);
      fecharModalRecebimento();
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
    } finally {
      elementos.modalRecebimentoConfirmar.disabled = false;
      elementos.modalRecebimentoConfirmar.textContent = "Confirmar recebimento";
    }
  }

  async function salvarPedido() {
    if (!elementos.campoFornecedor.value) {
      alert("Selecione um fornecedor.");
      return;
    }

    if (itensDoFormulario.length === 0) {
      alert("Adicione ao menos um item ao pedido.");
      return;
    }

    const temItemIncompleto = itensDoFormulario.some(item => !item.produto_id || !item.quantidade || item.preco_unitario == null);
    if (temItemIncompleto) {
      alert("Preencha produto, quantidade e preço de todos os itens antes de salvar.");
      return;
    }

    const dados = {
      fornecedor_id: parseInt(elementos.campoFornecedor.value, 10),
      forma_pagamento_id: elementos.campoFormaPagamento.value ? parseInt(elementos.campoFormaPagamento.value, 10) : null,
      data_entrega_prevista: elementos.campoDataEntrega.value || null,
      observacao: elementos.campoObservacao.value || null,
      itens: itensDoFormulario.map(item => ({
        produto_id: parseInt(item.produto_id, 10),
        quantidade: parseInt(item.quantidade, 10),
        preco_unitario: parseFloat(item.preco_unitario)
      }))
    };

    const botaoSalvar = document.getElementById("botao-salvar-pedido");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      const pedidoCriado = await pedidoCompraService.criar(dados);
      window.location.href = `pedido-compra-detalhe.html?id=${pedidoCriado.id}`;
    } catch (erro) {
      alert(erro.message);
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar pedido";
    }
  }

  function aplicarModoVisualizacao() {
    const modoLeitura = modoSomenteLeitura();

    elementos.titulo.textContent = `Pedido de Compra #${pedidoAtual.id}`;
    elementos.badgeStatus.textContent = pedidoAtual.status;
    elementos.badgeStatus.className = `badge-status-grande badge-status-grande--${pedidoAtual.status}`;
    elementos.badgeStatus.style.display = "inline-flex";

    elementos.campoFornecedor.value = pedidoAtual.fornecedor_id;
    elementos.campoFormaPagamento.value = pedidoAtual.forma_pagamento_id ?? "";
    elementos.campoDataEntrega.value = pedidoAtual.data_entrega_prevista
      ? pedidoAtual.data_entrega_prevista.slice(0, 10)
      : "";
    elementos.campoObservacao.value = pedidoAtual.observacao ?? "";

    elementos.campoFornecedor.disabled = true; // fornecedor nunca é editável após criado
    elementos.campoFormaPagamento.disabled = modoLeitura;
    elementos.campoDataEntrega.disabled = modoLeitura;
    elementos.campoObservacao.disabled = modoLeitura;
    elementos.botaoAdicionarItem.style.display = modoLeitura ? "none" : "inline-flex";

    itensDoFormulario = pedidoAtual.itens.map(item => ({
      id: item.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      quantidade_recebida: item.quantidade_recebida,
      preco_unitario: item.preco_unitario
    }));

    renderizarItens();
    renderizarAcoes();
  }

  elementos.botaoVoltar.addEventListener("click", () => {
    window.location.href = "pedidos-compra.html";
  });

  elementos.botaoAdicionarItem.addEventListener("click", adicionarLinhaItem);
  elementos.modalRecebimentoFechar.addEventListener("click", fecharModalRecebimento);
  elementos.modalRecebimentoCancelar.addEventListener("click", fecharModalRecebimento);
  elementos.modalRecebimentoConfirmar.addEventListener("click", confirmarRecebimento);
  elementos.modalRecebimentoOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalRecebimentoOverlay) fecharModalRecebimento();
  });

  await carregarDadosDeApoio();

  if (pedidoId) {
    try {
      pedidoAtual = await pedidoCompraService.buscarPorId(pedidoId);
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
      window.location.href = "pedidos-compra.html";
    }
  } else {
    elementos.titulo.textContent = "Novo pedido de compra";
    elementos.badgeStatus.style.display = "none";
    renderizarItens();
    renderizarAcoes();
  }
});