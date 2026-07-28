// Lógica da tela de Produtos: busca dados via produtoService, renderiza a tabela,
// controla o modal de criação/edição e os filtros de busca e status.

let produtosCache = [];
let abaAtiva = "ativos";
let produtoEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  aplicarMascaraMoeda(document.getElementById("campo-preco-custo"));
  aplicarMascaraMoeda(document.getElementById("campo-preco-venda"));

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-produtos-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-produto"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-produto"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-produto"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  async function carregarProdutos() {
    try {
      produtosCache = abaAtiva === "ativos"
        ? await produtoService.listar()
        : await produtoService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const produtosFiltrados = produtosCache.filter(produto => {
      if (!termoBusca) return true;
      return (
        produto.nome.toLowerCase().includes(termoBusca) ||
        (produto.categoria ?? "").toLowerCase().includes(termoBusca)
      );
    });

    if (produtosFiltrados.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = produtosFiltrados.map(produto => {
      const estoqueBaixo = produto.estoque_atual <= produto.estoque_minimo;
      const badgeEstoqueClasse = estoqueBaixo ? "badge-estoque--baixo" : "badge-estoque--ok";
      const badgeStatusClasse = produto.ativo ? "badge-status--ativo" : "badge-status--inativo";
      const precoFormatado = produto.preco_venda != null
        ? `R$ ${produto.preco_venda.toFixed(2).replace(".", ",")}`
        : "—";

      const botaoAcao = produto.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${produto.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${produto.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${produto.nome}</td>
          <td>${produto.categoria ?? "—"}</td>
          <td>${precoFormatado}</td>
          <td>
            <span class="badge-estoque ${badgeEstoqueClasse}">
              ${produto.estoque_atual} / ${produto.estoque_minimo}
            </span>
          </td>
          <td><span class="badge-status ${badgeStatusClasse}">${produto.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${produto.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${produto.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  // Preenche um <select> com o valor salvo. Se o valor não existir entre as opções
  // pré-definidas (ex: dado cadastrado antes da lista existir), cria a opção dinamicamente
  // para não perder a informação já salva no produto.
  function definirValorSelectComFallback(idSelect, valor) {
    const select = document.getElementById(idSelect);
    if (!valor) {
      select.value = "";
      return;
    }
    const existe = Array.from(select.options).some(opt => opt.value === valor);
    if (!existe) {
      const novaOpcao = document.createElement("option");
      novaOpcao.value = valor;
      novaOpcao.textContent = valor;
      select.appendChild(novaOpcao);
    }
    select.value = valor;
  }

  function formatarMoeda(numero) {
    return numero != null ? `R$ ${Number(numero).toFixed(2).replace(".", ",")}` : "—";
  }

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  function abrirModalVisualizacao(produto) {
    document.getElementById("vis-nome").textContent = produto.nome;
    document.getElementById("vis-status").textContent = produto.ativo ? "Ativo" : "Inativo";
    document.getElementById("vis-categoria").textContent = produto.categoria ?? "—";
    document.getElementById("vis-unidade").textContent = produto.unidade_medida ?? "—";
    document.getElementById("vis-descricao").textContent = produto.descricao ?? "—";
    document.getElementById("vis-preco-custo").textContent = formatarMoeda(produto.preco_custo);
    document.getElementById("vis-preco-venda").textContent = formatarMoeda(produto.preco_venda);
    document.getElementById("vis-estoque-atual").textContent = produto.estoque_atual;
    document.getElementById("vis-estoque-minimo").textContent = produto.estoque_minimo;
    document.getElementById("vis-estoque-reservado").textContent = produto.estoque_reservado ?? 0;
    document.getElementById("vis-estoque-disponivel").textContent = produto.estoque_disponivel ?? (produto.estoque_atual - (produto.estoque_reservado ?? 0));
    document.getElementById("vis-criado-em").textContent = formatarData(produto.created_at);

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  function abrirModal(produto = null) {
    elementos.form.reset();
    limparErrosForm();

    if (produto) {
      produtoEmEdicaoId = produto.id;
      elementos.modalTitulo.textContent = "Editar produto";
      document.getElementById("campo-nome").value = produto.nome;
      definirValorSelectComFallback("campo-categoria", produto.categoria);
      definirValorSelectComFallback("campo-unidade", produto.unidade_medida);
      document.getElementById("campo-descricao").value = produto.descricao ?? "";
      document.getElementById("campo-preco-custo").value = numeroParaMoeda(produto.preco_custo);
      document.getElementById("campo-preco-venda").value = numeroParaMoeda(produto.preco_venda);
      document.getElementById("campo-estoque-minimo").value = produto.estoque_minimo;
    } else {
      produtoEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo produto";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    produtoEmEdicaoId = null;
  }

  function limparErrosForm() {
    document.querySelectorAll(".campo-form").forEach(campo => campo.classList.remove("invalido"));
  }

  function validarForm(dados) {
    limparErrosForm();
    let valido = true;

    if (!dados.nome.trim()) {
      document.getElementById("campo-nome").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (dados.preco_custo == null || dados.preco_custo < 0) {
      document.getElementById("campo-preco-custo").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarProduto(evento) {
    evento.preventDefault();

    const dados = {
      nome: document.getElementById("campo-nome").value,
      categoria: document.getElementById("campo-categoria").value || null,
      unidade_medida: document.getElementById("campo-unidade").value || null,
      descricao: document.getElementById("campo-descricao").value || null,
      preco_custo: moedaParaNumero(document.getElementById("campo-preco-custo").value),
      preco_venda: moedaParaNumero(document.getElementById("campo-preco-venda").value),
      estoque_minimo: parseInt(document.getElementById("campo-estoque-minimo").value || "0", 10)
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (produtoEmEdicaoId) {
        await produtoService.atualizar(produtoEmEdicaoId, dados);
      } else {
        await produtoService.criar(dados);
      }
      fecharModal();
      await carregarProdutos();
    } catch (erro) {
      alert(erro.message);
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar";
    }
  }

  async function tratarAcaoTabela(evento) {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao) return;

    const id = parseInt(botao.dataset.id, 10);
    const acao = botao.dataset.acao;

    if (acao === "visualizar") {
      const produto = produtosCache.find(p => p.id === id);
      if (produto) abrirModalVisualizacao(produto);
    }

    if (acao === "editar") {
      const produto = produtosCache.find(p => p.id === id);
      if (produto) abrirModal(produto);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar este produto? Ele deixará de aparecer na listagem de ativos.")) return;
      try {
        await produtoService.desativar(id);
        await carregarProdutos();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await produtoService.reativar(id);
        await carregarProdutos();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtiva = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarProdutos();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarProduto);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarProdutos();
});