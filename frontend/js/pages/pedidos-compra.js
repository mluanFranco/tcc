// Lógica da tela de listagem de Pedidos de Compra.
// A criação/edição/ações sobre um pedido específico ficam em pedido-compra-detalhe.js.

let pedidosCompraCache = [];
let fornecedoresMapCache = {}; // { id: nome }
let filtroStatusAtivoCompra = "todos";

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-pedidos-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    botaoIncluir: document.getElementById("botao-incluir"),
    abas: document.querySelectorAll(".aba-status[data-status]"),
    campoBusca: document.getElementById("campo-busca"),
    campoDataInicio: document.getElementById("campo-data-inicio"),
    campoDataFim: document.getElementById("campo-data-fim")
  };

  function formatarMoeda(numero) {
    return `R$ ${Number(numero).toFixed(2).replace(".", ",")}`;
  }

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  async function carregarFornecedoresMap() {
    const fornecedores = await fornecedorService.listar({ incluirInativos: true });
    fornecedoresMapCache = fornecedores.reduce((mapa, fornecedor) => {
      mapa[fornecedor.id] = fornecedor.nome;
      return mapa;
    }, {});
  }

  function nomeFornecedor(fornecedorId) {
    return fornecedoresMapCache[fornecedorId] ?? `Fornecedor #${fornecedorId}`;
  }

  async function carregarPedidos() {
    try {
      const status = filtroStatusAtivoCompra === "todos" ? null : filtroStatusAtivoCompra;
      pedidosCompraCache = await pedidoCompraService.listar({ status });
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function pedidosFiltrados() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();
    const dataInicio = elementos.campoDataInicio.value;
    const dataFim = elementos.campoDataFim.value;

    return pedidosCompraCache.filter(pedido => {
      if (termoBusca) {
        const nome = nomeFornecedor(pedido.fornecedor_id).toLowerCase();
        const idTexto = String(pedido.id);
        const correspondeTermo = nome.includes(termoBusca) || idTexto.includes(termoBusca);
        if (!correspondeTermo) return false;
      }

      const dataPedido = pedido.data_pedido.slice(0, 10);

      if (dataInicio && dataPedido < dataInicio) return false;
      if (dataFim && dataPedido > dataFim) return false;

      return true;
    });
  }

  function renderizarTabela() {
    const lista = pedidosFiltrados();

    if (lista.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = lista
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(pedido => `
        <tr class="linha-clicavel" data-id="${pedido.id}">
          <td class="celula-nome">#${pedido.id}</td>
          <td>${nomeFornecedor(pedido.fornecedor_id)}</td>
          <td>${formatarData(pedido.data_pedido)}</td>
          <td>${formatarData(pedido.data_entrega_prevista)}</td>
          <td>${formatarMoeda(pedido.valor_total)}</td>
          <td><span class="badge-status-grande badge-status-grande--${pedido.status}">${pedido.status}</span></td>
        </tr>
      `).join("");
  }

  elementos.botaoIncluir.addEventListener("click", () => {
    window.location.href = "pedido-compra-detalhe.html";
  });

  elementos.tabelaCorpo.addEventListener("click", (evento) => {
    const linha = evento.target.closest("tr[data-id]");
    if (!linha) return;
    window.location.href = `pedido-compra-detalhe.html?id=${linha.dataset.id}`;
  });

  elementos.abas.forEach(aba => {
    aba.addEventListener("click", () => {
      elementos.abas.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroStatusAtivoCompra = aba.dataset.status;
      carregarPedidos();
    });
  });

  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.campoDataInicio.addEventListener("change", renderizarTabela);
  elementos.campoDataFim.addEventListener("change", renderizarTabela);

  await carregarFornecedoresMap();
  await carregarPedidos();
});