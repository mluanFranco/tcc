// Lista de Pedidos de Venda. Criar um pedido é em pedido-venda-novo.html;
// ver e mudar o status de um pedido é em pedido-venda-detalhe.html.
// O backend só filtra por status; busca por cliente/número e período são feitos aqui, na lista carregada.

let pedidosVendaCache = [];
let clientesMapCache = {};   // { id: nome }
let filtroStatusAtivo = "todos";
let requisicaoAtual = 0;     // descarta respostas antigas se o usuário trocar de aba rápido

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("vendas.ver")) return;

  const podeEditar = temPermissao("vendas.editar");

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-pedidos-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    estadoCarregando: document.getElementById("estado-carregando"),
    botaoIncluir: document.getElementById("botao-incluir"),
    abas: document.querySelectorAll(".aba-status[data-status]"),
    campoBusca: document.getElementById("campo-busca"),
    campoDataInicio: document.getElementById("campo-data-inicio"),
    campoDataFim: document.getElementById("campo-data-fim")
  };

  elementos.botaoIncluir.hidden = !podeEditar;

  function nomeCliente(clienteId) {
    return clientesMapCache[clienteId] ?? `Cliente #${clienteId}`;
  }

  function periodoInvalido() {
    const inicio = elementos.campoDataInicio.value;
    const fim = elementos.campoDataFim.value;
    return Boolean(inicio && fim && inicio > fim);
  }

  function pedidosFiltrados() {
    const termo = elementos.campoBusca.value.trim().toLowerCase();
    const termoNumerico = termo.replace(/^#/, "");
    const inicio = elementos.campoDataInicio.value;
    const fim = elementos.campoDataFim.value;

    return pedidosVendaCache.filter(pedido => {
      if (termo) {
        const nome = nomeCliente(pedido.cliente_id).toLowerCase();
        const numero = formatarNumeroPedido(pedido.id);
        const casaNumero = /^\d+$/.test(termoNumerico) && (numero.includes(termoNumerico) || String(pedido.id).includes(termoNumerico));
        if (!nome.includes(termo) && !casaNumero) return false;
      }
      const dia = String(pedido.data_pedido).slice(0, 10);   // AAAA-MM-DD
      if (inicio && dia < inicio) return false;
      if (fim && dia > fim) return false;
      return true;
    });
  }

  function mostrarVazio(texto, aviso = false) {
    elementos.tabelaCorpo.innerHTML = "";
    elementos.estadoVazio.textContent = texto;
    elementos.estadoVazio.classList.toggle("aviso-periodo", aviso);
    elementos.estadoVazio.hidden = false;
  }

  function renderizarTabela() {
    elementos.estadoCarregando.hidden = true;

    if (periodoInvalido()) {
      mostrarVazio("Período inválido: a data inicial é posterior à data final.", true);
      return;
    }

    const lista = pedidosFiltrados();
    if (lista.length === 0) {
      const filtrando = pedidosVendaCache.length > 0;
      mostrarVazio(filtrando ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido encontrado.");
      return;
    }

    elementos.estadoVazio.hidden = true;
    elementos.tabelaCorpo.innerHTML = lista
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(pedido => {
        const quantidadeLinhas = pedido.itens.length;
        return `
          <tr class="linha-clicavel" data-id="${pedido.id}" tabindex="0">
            <td class="celula-nome">${formatarNumeroPedido(pedido.id)}</td>
            <td>${escaparHtml(nomeCliente(pedido.cliente_id))}</td>
            <td>${formatarData(pedido.data_pedido)}</td>
            <td>${quantidadeLinhas} ${quantidadeLinhas === 1 ? "item" : "itens"}</td>
            <td class="celula-numero">${formatarMoeda(pedido.valor_total)}</td>
            <td><span class="badge-status badge-status--${escaparHtml(pedido.status)}">${escaparHtml(rotuloStatusPedido(pedido.status))}</span></td>
          </tr>
        `;
      }).join("");
  }

  async function carregarClientes() {
    try {
      const clientes = await clienteService.listar({ incluirInativos: true });
      clientesMapCache = clientes.reduce((mapa, cliente) => {
        mapa[cliente.id] = cliente.nome;
        return mapa;
      }, {});
    } catch (erro) {
      // Sem o nome o pedido ainda aparece como "Cliente #id"; avisa e segue.
      toast.erro(`Não foi possível carregar os nomes dos clientes. ${erro.message}`);
    }
  }

  async function carregarPedidos() {
    const minha = ++requisicaoAtual;
    elementos.tabelaCorpo.innerHTML = "";
    elementos.estadoVazio.hidden = true;
    elementos.estadoCarregando.hidden = false;

    try {
      const status = filtroStatusAtivo === "todos" ? null : filtroStatusAtivo;
      const dados = await pedidoVendaService.listar({ status });
      if (minha !== requisicaoAtual) return;
      pedidosVendaCache = dados;
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      pedidosVendaCache = [];
      mostrarVazio("Não foi possível carregar os pedidos.");
      toast.erro(erro.message);
    }
  }

  function abrirPedido(linha) {
    if (linha) window.location.href = `pedido-venda-detalhe.html?id=${linha.dataset.id}`;
  }

  elementos.botaoIncluir.addEventListener("click", () => {
    window.location.href = "pedido-venda-novo.html";
  });

  elementos.tabelaCorpo.addEventListener("click", (evento) => abrirPedido(evento.target.closest("tr[data-id]")));
  elementos.tabelaCorpo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") abrirPedido(evento.target.closest("tr[data-id]"));
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

  await carregarClientes();
  await carregarPedidos();
});
