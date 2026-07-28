// Lógica da tela de listagem de Pedidos de Venda.
// A criação/edição/ações sobre um pedido específico ficam em pedido-venda-detalhe.js.

let pedidosVendaCache = [];
let clientesMapCache = {}; // { id: nome }
let filtroStatusAtivo = "todos";

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
    const data = new Date(isoString);
    return data.toLocaleDateString("pt-BR");
  }

  async function carregarClientesMap() {
    const clientes = await clienteService.listar({ incluirInativos: true });
    clientesMapCache = clientes.reduce((mapa, cliente) => {
      mapa[cliente.id] = cliente.nome;
      return mapa;
    }, {});
  }

  function nomeCliente(clienteId) {
    return clientesMapCache[clienteId] ?? `Cliente #${clienteId}`;
  }

  async function carregarPedidos() {
    try {
      const status = filtroStatusAtivo === "todos" ? null : filtroStatusAtivo;
      pedidosVendaCache = await pedidoVendaService.listar({ status });
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function pedidosFiltrados() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();
    const dataInicio = elementos.campoDataInicio.value;
    const dataFim = elementos.campoDataFim.value;

    return pedidosVendaCache.filter(pedido => {
      if (termoBusca) {
        const nome = nomeCliente(pedido.cliente_id).toLowerCase();
        const idTexto = String(pedido.id);
        const correspondeTermo = nome.includes(termoBusca) || idTexto.includes(termoBusca);
        if (!correspondeTermo) return false;
      }

      const dataPedido = pedido.data_pedido.slice(0, 10); // YYYY-MM-DD

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
      .map(pedido => {
        const totalItens = pedido.itens.reduce((soma, item) => soma + item.quantidade, 0);
        return `
          <tr class="linha-clicavel" data-id="${pedido.id}">
            <td class="celula-nome">#${pedido.id}</td>
            <td>${nomeCliente(pedido.cliente_id)}</td>
            <td>${formatarData(pedido.data_pedido)}</td>
            <td>${totalItens} ${totalItens === 1 ? "item" : "itens"}</td>
            <td>${formatarMoeda(pedido.valor_total)}</td>
            <td><span class="badge-status-grande badge-status-grande--${pedido.status}">${pedido.status}</span></td>
          </tr>
        `;
      }).join("");
  }

  elementos.botaoIncluir.addEventListener("click", () => {
    window.location.href = "pedido-venda-detalhe.html";
  });

  elementos.tabelaCorpo.addEventListener("click", (evento) => {
    const linha = evento.target.closest("tr[data-id]");
    if (!linha) return;
    window.location.href = `pedido-venda-detalhe.html?id=${linha.dataset.id}`;
  });

  elementos.abas.forEach(aba => {
    aba.addEventListener("click", () => {
      elementos.abas.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroStatusAtivo = aba.dataset.status;
      carregarPedidos();
    });
  });

  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.campoDataInicio.addEventListener("change", renderizarTabela);
  elementos.campoDataFim.addEventListener("change", renderizarTabela);

  await carregarClientesMap();
  await carregarPedidos();
});