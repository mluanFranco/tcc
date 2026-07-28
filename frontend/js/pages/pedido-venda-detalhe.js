// Lógica da tela de detalhe de Pedido de Venda.
// Sem ?id na URL: modo de criação (cabeçalho + itens editáveis).
// Com ?id na URL: carrega o pedido existente. Editável apenas se status === "aberto".

let pedidoAtual = null;
let produtosDisponiveis = [];
let clientesDisponiveis = [];
let itensDoFormulario = []; // [{ produto_id, quantidade, preco_unitario, desconto }]

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = params.get("id");

  const elementos = {
    titulo: document.getElementById("detalhe-titulo"),
    badgeStatus: document.getElementById("badge-status"),
    botaoVoltar: document.getElementById("botao-voltar"),
    campoCliente: document.getElementById("campo-cliente"),
    campoFormaPagamento: document.getElementById("campo-forma-pagamento"),
    campoObservacao: document.getElementById("campo-observacao"),
    tabelaItensCorpo: document.getElementById("tabela-itens-corpo"),
    itensVazio: document.getElementById("itens-vazio"),
    botaoAdicionarItem: document.getElementById("botao-adicionar-item"),
    totalExibicao: document.getElementById("total-exibicao"),
    acoesContainer: document.getElementById("acoes-container")
  };

  function formatarMoeda(numero) {
    return `R$ ${Number(numero || 0).toFixed(2).replace(".", ",")}`;
  }

  async function carregarDadosDeApoio() {
    [produtosDisponiveis, clientesDisponiveis] = await Promise.all([
      produtoService.listar(),
      clienteService.listar()
    ]);

    elementos.campoCliente.innerHTML = '<option value="">Selecione um cliente...</option>' +
      clientesDisponiveis.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  }

  function calcularTotal() {
    return itensDoFormulario.reduce((soma, item) => soma + calcularSubtotalItem(item), 0);
  }

  function calcularSubtotalItem(item) {
    const quantidade = Number(item.quantidade) || 0;
    const preco = Number(item.preco_unitario) || 0;
    const descontoPercentual = Number(item.desconto_percentual) || 0;
    const valorBruto = quantidade * preco;
    const valorDesconto = valorBruto * (descontoPercentual / 100);
    return valorBruto - valorDesconto;
  }

  function produtoPorId(id) {
    return produtosDisponiveis.find(p => p.id === Number(id));
  }

  function estoqueExcedido(item) {
    const produto = produtoPorId(item.produto_id);
    if (!produto) return false;
    return Number(item.quantidade) > produto.estoque_disponivel;
  }

  function renderizarItens() {
    const modoLeitura = pedidoAtual && pedidoAtual.status !== "aberto";

    if (itensDoFormulario.length === 0) {
      elementos.tabelaItensCorpo.innerHTML = "";
      elementos.itensVazio.style.display = "block";
    } else {
      elementos.itensVazio.style.display = "none";

      elementos.tabelaItensCorpo.innerHTML = itensDoFormulario.map((item, index) => {
        const excedido = !modoLeitura && estoqueExcedido(item);
        const produtoSelecionado = produtoPorId(item.produto_id);

        if (modoLeitura) {
          return `
            <tr>
              <td>${produtoSelecionado ? produtoSelecionado.nome : `Produto #${item.produto_id}`}</td>
              <td>${item.quantidade}</td>
              <td>${formatarMoeda(item.preco_unitario)}</td>
              <td>${Number(item.desconto_percentual || 0).toFixed(1)}%</td>
              <td class="subtotal-exibicao">${formatarMoeda(calcularSubtotalItem(item))}</td>
              <td></td>
            </tr>
          `;
        }

        const opcoesProduto = produtosDisponiveis.map(p =>
          `<option value="${p.id}" ${Number(item.produto_id) === p.id ? "selected" : ""}>${p.nome} (disp. ${p.estoque_disponivel})</option>`
        ).join("");

        return `
          <tr class="${excedido ? "linha-item--invalida" : ""}">
            <td>
              <select data-index="${index}" data-campo="produto_id">
                <option value="">Selecione...</option>
                ${opcoesProduto}
              </select>
              ${excedido ? `<span class="aviso-estoque">Quantidade acima do estoque disponível</span>` : ""}
            </td>
            <td class="coluna-qtd">
              <input type="number" min="1" data-index="${index}" data-campo="quantidade" value="${item.quantidade}">
            </td>
            <td class="coluna-preco">
              <input type="number" min="0" step="0.01" data-index="${index}" data-campo="preco_unitario" value="${item.preco_unitario}">
            </td>
            <td class="coluna-desconto">
              <input type="number" min="0" max="100" step="0.1" data-index="${index}" data-campo="desconto_percentual" value="${item.desconto_percentual}">
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
    itensDoFormulario.push({ produto_id: "", quantidade: 1, preco_unitario: 0, desconto_percentual: 0 });
    renderizarItens();
  }

  function existeItemInvalido() {
    return itensDoFormulario.some(item => !item.produto_id || estoqueExcedido(item));
  }

  elementos.tabelaItensCorpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const index = evento.target.dataset.index;
    if (campo === undefined || index === undefined) return;

    itensDoFormulario[index][campo] = evento.target.value;

    if (campo === "produto_id") {
      const produto = produtoPorId(evento.target.value);
      if (produto && produto.preco_venda != null) {
        itensDoFormulario[index].preco_unitario = produto.preco_venda;
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
      // Modo criação
      elementos.acoesContainer.innerHTML = `
        <button class="botao-primario" id="botao-salvar-pedido">Salvar pedido</button>
      `;
      document.getElementById("botao-salvar-pedido").addEventListener("click", salvarPedido);
      return;
    }

    if (pedidoAtual.status === "aberto") {
      elementos.acoesContainer.innerHTML = `
        <button class="botao-perigo" id="botao-cancelar-pedido">Cancelar pedido</button>
        <button class="botao-sucesso" id="botao-confirmar-pedido">Confirmar pedido</button>
      `;
      document.getElementById("botao-cancelar-pedido").addEventListener("click", () => mudarStatus("cancelado"));
      document.getElementById("botao-confirmar-pedido").addEventListener("click", () => mudarStatus("confirmado"));
    }

    if (pedidoAtual.status === "confirmado") {
      elementos.acoesContainer.innerHTML = `
        <button class="botao-perigo" id="botao-cancelar-pedido">Cancelar pedido</button>
      `;
      document.getElementById("botao-cancelar-pedido").addEventListener("click", () => mudarStatus("cancelado"));
    }
  }

  async function mudarStatus(novoStatus) {
    const mensagens = {
      confirmado: "Confirmar este pedido? O estoque reservado será debitado definitivamente.",
      cancelado: "Cancelar este pedido? Esta ação não pode ser desfeita."
    };

    if (!confirm(mensagens[novoStatus])) return;

    try {
      pedidoAtual = await pedidoVendaService.atualizarStatus(pedidoAtual.id, novoStatus);
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
    }
  }

  async function salvarPedido() {
    if (!elementos.campoCliente.value) {
      alert("Selecione um cliente.");
      return;
    }

    if (itensDoFormulario.length === 0) {
      alert("Adicione ao menos um item ao pedido.");
      return;
    }

    if (existeItemInvalido()) {
      alert("Corrija os itens com estoque insuficiente ou produto não selecionado antes de salvar.");
      return;
    }

    const dados = {
      cliente_id: parseInt(elementos.campoCliente.value, 10),
      forma_pagamento: elementos.campoFormaPagamento.value || null,
      observacao: elementos.campoObservacao.value || null,
      itens: itensDoFormulario.map(item => {
        const quantidade = parseInt(item.quantidade, 10);
        const precoUnitario = parseFloat(item.preco_unitario);
        const descontoPercentual = parseFloat(item.desconto_percentual) || 0;
        const descontoEmReais = (quantidade * precoUnitario) * (descontoPercentual / 100);

        return {
          produto_id: parseInt(item.produto_id, 10),
          quantidade,
          preco_unitario: precoUnitario,
          desconto: Number(descontoEmReais.toFixed(2))
        };
      })
    };

    const botaoSalvar = document.getElementById("botao-salvar-pedido");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      const pedidoCriado = await pedidoVendaService.criar(dados);
      window.location.href = `pedido-venda-detalhe.html?id=${pedidoCriado.id}`;
    } catch (erro) {
      alert(erro.message);
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar pedido";
    }
  }

  function aplicarModoVisualizacao() {
    const modoLeitura = pedidoAtual && pedidoAtual.status !== "aberto";

    elementos.titulo.textContent = `Pedido de Venda #${pedidoAtual.id}`;
    elementos.badgeStatus.textContent = pedidoAtual.status;
    elementos.badgeStatus.className = `badge-status-grande badge-status-grande--${pedidoAtual.status}`;
    elementos.badgeStatus.style.display = "inline-flex";

    elementos.campoCliente.value = pedidoAtual.cliente_id;
    elementos.campoFormaPagamento.value = pedidoAtual.forma_pagamento ?? "";
    elementos.campoObservacao.value = pedidoAtual.observacao ?? "";

    elementos.campoCliente.disabled = modoLeitura;
    elementos.campoFormaPagamento.disabled = modoLeitura;
    elementos.campoObservacao.disabled = modoLeitura;
    elementos.botaoAdicionarItem.style.display = modoLeitura ? "none" : "inline-flex";

    itensDoFormulario = pedidoAtual.itens.map(item => {
      const valorBruto = item.quantidade * item.preco_unitario;
      const descontoPercentual = valorBruto > 0
        ? Number(((item.desconto / valorBruto) * 100).toFixed(1))
        : 0;

      return {
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        desconto_percentual: descontoPercentual
      };
    });

    renderizarItens();
    renderizarAcoes();
  }

  elementos.botaoVoltar.addEventListener("click", () => {
    window.location.href = "pedidos-venda.html";
  });

  elementos.botaoAdicionarItem.addEventListener("click", adicionarLinhaItem);

  await carregarDadosDeApoio();

  if (pedidoId) {
    try {
      pedidoAtual = await pedidoVendaService.buscarPorId(pedidoId);
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
      window.location.href = "pedidos-venda.html";
    }
  } else {
    elementos.titulo.textContent = "Novo pedido de venda";
    elementos.badgeStatus.style.display = "none";
    renderizarItens();
    renderizarAcoes();
  }
});