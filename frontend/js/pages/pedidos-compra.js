// Lista de Pedidos de Compra. Criar um pedido é em pedido-compra-novo.html;
// ver, receber e cancelar é em pedido-compra-detalhe.html.
// O backend só filtra por status (pendente | recebido | cancelado); busca por fornecedor/número e período são feitos aqui.
// "Parcial" e "Atrasado" são indicações derivadas (ver situacaoPedidoCompra); a aba Pendentes inclui os parciais.

let pedidosCache = [];
let fornecedoresMapCache = {};   // { id: nome }
let filtroStatusAtivo = "todos";
let requisicaoAtual = 0;     // descarta respostas antigas se o usuário trocar de aba rápido

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("compras.ver")) return;

  const podeEditar = temPermissao("compras.editar");

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

  function nomeFornecedor(fornecedorId) {
    return fornecedoresMapCache[fornecedorId] ?? `Fornecedor #${fornecedorId}`;
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

    return pedidosCache.filter(pedido => {
      if (termo) {
        const nome = nomeFornecedor(pedido.fornecedor_id).toLowerCase();
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
      const filtrando = pedidosCache.length > 0;
      mostrarVazio(filtrando ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido encontrado.");
      return;
    }

    elementos.estadoVazio.hidden = true;
    elementos.tabelaCorpo.innerHTML = lista
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(pedido => {
        const quantidadeLinhas = pedido.itens.length;
        const situacao = situacaoPedidoCompra(pedido);
        const selo = situacao.atrasado ? '<span class="badge-status badge-status--atrasado">Atrasado</span>' : "";
        return `
          <tr class="linha-clicavel" data-id="${pedido.id}" tabindex="0">
            <td class="celula-nome">${formatarNumeroPedido(pedido.id)}</td>
            <td>${escaparHtml(nomeFornecedor(pedido.fornecedor_id))}</td>
            <td>${formatarData(pedido.data_pedido)}</td>
            <td${situacao.atrasado ? ' class="celula-atrasada"' : ""}>${formatarData(pedido.data_entrega_prevista)}</td>
            <td>${quantidadeLinhas} ${quantidadeLinhas === 1 ? "item" : "itens"}</td>
            <td class="celula-numero">${formatarMoeda(pedido.valor_total)}</td>
            <td><span class="badge-status badge-status--${escaparHtml(situacao.chave)}">${escaparHtml(situacao.rotulo)}</span>${selo}</td>
          </tr>
        `;
      }).join("");
  }

  async function carregarFornecedores() {
    try {
      const fornecedores = await fornecedorService.listar({ incluirInativos: true });
      fornecedoresMapCache = fornecedores.reduce((mapa, fornecedor) => {
        mapa[fornecedor.id] = fornecedor.nome;
        return mapa;
      }, {});
    } catch (erro) {
      // Sem o nome o pedido ainda aparece como "Fornecedor #id"; avisa e segue.
      toast.erro(`Não foi possível carregar os nomes dos fornecedores. ${erro.message}`);
    }
  }

  async function carregarPedidos() {
    const minha = ++requisicaoAtual;
    elementos.tabelaCorpo.innerHTML = "";
    elementos.estadoVazio.hidden = true;
    elementos.estadoCarregando.hidden = false;

    try {
      const status = filtroStatusAtivo === "todos" ? null : filtroStatusAtivo;
      const dados = await pedidoCompraService.listar({ status });
      if (minha !== requisicaoAtual) return;
      pedidosCache = dados;
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      pedidosCache = [];
      mostrarVazio("Não foi possível carregar os pedidos.");
      toast.erro(erro.message);
    }
  }

  function abrirPedido(linha) {
    if (linha) window.location.href = `pedido-compra-detalhe.html?id=${linha.dataset.id}`;
  }

  elementos.botaoIncluir.addEventListener("click", () => {
    window.location.href = "pedido-compra-novo.html";
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

  await carregarFornecedores();
  await carregarPedidos();
});
