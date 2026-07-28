// Lógica da tela de Cotações: aba de listagem (com busca e filtro de status)
// e aba de comparativo de preços por produto.

let cotacoesCache = [];
let fornecedoresMapCotacao = {};
let filtroStatusCotacao = "todos";
let abaAtivaCotacao = "lista";

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    botaoIncluir: document.getElementById("botao-incluir"),
    abaLista: document.getElementById("aba-lista"),
    abaComparativo: document.getElementById("aba-comparativo"),
    painelLista: document.getElementById("painel-lista"),
    painelComparativo: document.getElementById("painel-comparativo"),
    tabelaCorpo: document.getElementById("tabela-cotacoes-corpo"),
    estadoVazioLista: document.getElementById("estado-vazio-lista"),
    campoBusca: document.getElementById("campo-busca"),
    abasStatus: document.querySelectorAll(".aba-status[data-status]"),
    campoProdutoComparativo: document.getElementById("campo-produto-comparativo"),
    containerComparativo: document.getElementById("container-comparativo"),
    tabelaComparativoCorpo: document.getElementById("tabela-comparativo-corpo"),
    estadoVazioComparativo: document.getElementById("estado-vazio-comparativo")
  };

  function formatarMoeda(numero) {
    return `R$ ${Number(numero).toFixed(2).replace(".", ",")}`;
  }

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  // ---------- Aba: Lista de Cotações ----------

  async function carregarFornecedoresMap() {
    const fornecedores = await fornecedorService.listar({ incluirInativos: true });
    fornecedoresMapCotacao = fornecedores.reduce((mapa, f) => {
      mapa[f.id] = f.nome;
      return mapa;
    }, {});
  }

  function nomeFornecedor(id) {
    return fornecedoresMapCotacao[id] ?? `Fornecedor #${id}`;
  }

  async function carregarCotacoes() {
    try {
      const status = filtroStatusCotacao === "todos" ? null : filtroStatusCotacao;
      cotacoesCache = await cotacaoService.listar({ status });
      renderizarTabelaCotacoes();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabelaCotacoes() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = cotacoesCache.filter(c =>
      !termoBusca || nomeFornecedor(c.fornecedor_id).toLowerCase().includes(termoBusca)
    );

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazioLista.style.display = "block";
      return;
    }

    elementos.estadoVazioLista.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(cotacao => `
        <tr>
          <td class="celula-nome">#${cotacao.id}</td>
          <td>${nomeFornecedor(cotacao.fornecedor_id)}</td>
          <td>${formatarData(cotacao.data_cotacao)}</td>
          <td>${cotacao.itens.length} ${cotacao.itens.length === 1 ? "item" : "itens"}</td>
          <td><span class="badge-status-grande badge-status-grande--${statusParaClasse(cotacao.status)}">${cotacao.status}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${cotacao.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone botao-icone--perigo" data-acao="excluir" data-id="${cotacao.id}" title="Excluir" aria-label="Excluir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
            </button>
          </td>
        </tr>
      `).join("");
  }

  function statusParaClasse(status) {
    if (status === "aprovada") return "confirmado";
    if (status === "rascunho") return "aberto";
    return "pendente"; // enviada, recebida
  }

  elementos.tabelaCorpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;

    const id = botao.dataset.id;

    if (botao.dataset.acao === "visualizar") {
      window.location.href = `cotacao-detalhe.html?id=${id}`;
    }

    if (botao.dataset.acao === "excluir") {
      if (!confirm("Excluir esta cotação permanentemente? Esta ação não pode ser desfeita.")) return;
      try {
        await cotacaoService.excluir(id);
        await carregarCotacoes();
      } catch (erro) {
        alert(erro.message);
      }
    }
  });

  elementos.botaoIncluir.addEventListener("click", () => {
    window.location.href = "cotacao-detalhe.html";
  });

  elementos.campoBusca.addEventListener("input", renderizarTabelaCotacoes);

  elementos.abasStatus.forEach(aba => {
    aba.addEventListener("click", () => {
      elementos.abasStatus.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroStatusCotacao = aba.dataset.status;
      carregarCotacoes();
    });
  });

  // ---------- Aba: Comparativo de Preços ----------

  async function carregarProdutosParaComparativo() {
    const produtos = await produtoService.listar();
    elementos.campoProdutoComparativo.innerHTML = '<option value="">Selecione um produto...</option>' +
      produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join("");
  }

  async function carregarComparativo(produtoId) {
    if (!produtoId) {
      elementos.containerComparativo.style.display = "none";
      elementos.estadoVazioComparativo.style.display = "none";
      return;
    }

    try {
      const resultados = await cotacaoService.comparativoPorProduto(produtoId);

      if (resultados.length === 0) {
        elementos.containerComparativo.style.display = "none";
        elementos.estadoVazioComparativo.style.display = "block";
        return;
      }

      elementos.estadoVazioComparativo.style.display = "none";
      elementos.containerComparativo.style.display = "block";

      elementos.tabelaComparativoCorpo.innerHTML = resultados.map((item, index) => `
        <tr>
          <td><span class="posicao-ranking ${index === 0 ? "posicao-ranking--melhor" : ""}">${index + 1}</span></td>
          <td class="celula-nome">${item.fornecedor_nome}</td>
          <td>${formatarMoeda(item.preco_unitario)}</td>
          <td>${item.quantidade_referencia}</td>
          <td>${formatarData(item.data_cotacao)}</td>
        </tr>
      `).join("");
    } catch (erro) {
      alert(erro.message);
    }
  }

  elementos.campoProdutoComparativo.addEventListener("change", () => {
    carregarComparativo(elementos.campoProdutoComparativo.value);
  });

  // ---------- Alternância entre abas principais ----------

  function trocarAbaPrincipal(aba) {
    abaAtivaCotacao = aba;
    elementos.abaLista.classList.toggle("aba-secundaria--ativa", aba === "lista");
    elementos.abaComparativo.classList.toggle("aba-secundaria--ativa", aba === "comparativo");
    elementos.painelLista.style.display = aba === "lista" ? "block" : "none";
    elementos.painelComparativo.style.display = aba === "comparativo" ? "block" : "none";
    elementos.botaoIncluir.style.display = aba === "lista" ? "flex" : "none";
  }

  elementos.abaLista.addEventListener("click", () => trocarAbaPrincipal("lista"));
  elementos.abaComparativo.addEventListener("click", () => trocarAbaPrincipal("comparativo"));

  await carregarFornecedoresMap();
  await carregarCotacoes();
  await carregarProdutosParaComparativo();
});