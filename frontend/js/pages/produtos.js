// Lógica da tela de Produtos: cadastro/subcategoria/unidade dependentes,
// tipo de produto (insumo/vendável) e cálculo somente-leitura de preço de venda.

let produtosCache = [];
let categoriasCache = [];
let subcategoriasCacheGlobal = [];
let unidadesCache = [];
let abaAtiva = "ativos";
let produtoEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  aplicarMascaraMoeda(document.getElementById("campo-preco-custo"));

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-produtos-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    campoCategoria: document.getElementById("campo-categoria"),
    campoSubcategoria: document.getElementById("campo-subcategoria"),
    campoUnidade: document.getElementById("campo-unidade"),
    campoEInsumo: document.getElementById("campo-e-insumo"),
    campoEVendavel: document.getElementById("campo-e-vendavel"),
    blocoPorcentagem: document.getElementById("bloco-porcentagem"),
    campoPorcentagem: document.getElementById("campo-porcentagem"),
    blocoPrecoVenda: document.getElementById("bloco-preco-venda"),
    campoPrecoCusto: document.getElementById("campo-preco-custo"),
    campoPrecoVenda: document.getElementById("campo-preco-venda"),
    modalOverlay: document.getElementById("modal-produto"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-produto"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-produto"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  // ---------- Resolução de nomes (categoria/subcategoria/unidade) ----------

  function nomeCategoria(id) {
    const c = categoriasCache.find(c => c.id === id);
    return c ? c.nome : "—";
  }

  function nomeSubcategoria(id) {
    const s = subcategoriasCacheGlobal.find(s => s.id === id);
    return s ? s.nome : "—";
  }

  function nomeUnidade(id) {
    const u = unidadesCache.find(u => u.id === id);
    return u ? `${u.nome} (${u.sigla})` : "—";
  }

  function rotuloTipo(produto) {
    if (produto.e_insumo && produto.e_vendavel) return "Insumo + Vendável";
    if (produto.e_insumo) return "Insumo";
    if (produto.e_vendavel) return "Vendável";
    return "—";
  }

  // ---------- Carregamento dos selects de apoio ----------

  async function carregarListasDeApoio() {
    try {
      [categoriasCache, unidadesCache, subcategoriasCacheGlobal] = await Promise.all([
        categoriaService.listar(),
        unidadeMedidaService.listar(),
        subcategoriaService.listar()
      ]);

      elementos.campoCategoria.innerHTML =
        `<option value="">Selecione...</option>` +
        categoriasCache.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");

      elementos.campoUnidade.innerHTML =
        `<option value="">Selecione...</option>` +
        unidadesCache.map(u => `<option value="${u.id}">${u.nome} (${u.sigla})</option>`).join("");
    } catch (erro) {
      alert("Não foi possível carregar categorias/unidades: " + erro.message);
    }
  }

  async function atualizarSubcategoriasPorCategoria(categoriaId, subcategoriaSelecionadaId = null) {
    if (!categoriaId) {
      elementos.campoSubcategoria.innerHTML = `<option value="">Selecione a categoria primeiro...</option>`;
      elementos.campoSubcategoria.disabled = true;
      return;
    }

    try {
      const subcategorias = await subcategoriaService.listar({ categoriaId });
      elementos.campoSubcategoria.innerHTML =
        `<option value="">Selecione...</option>` +
        subcategorias.map(s => `<option value="${s.id}">${s.nome}</option>`).join("");
      elementos.campoSubcategoria.disabled = false;

      if (subcategoriaSelecionadaId) {
        elementos.campoSubcategoria.value = subcategoriaSelecionadaId;
      }
    } catch (erro) {
      alert("Não foi possível carregar as subcategorias: " + erro.message);
    }
  }

  // ---------- Visibilidade condicional (tipo vendável) ----------

  function atualizarVisibilidadeCamposVenda() {
    const vendavel = elementos.campoEVendavel.checked;
    elementos.blocoPorcentagem.style.display = vendavel ? "flex" : "none";
    elementos.blocoPrecoVenda.style.display = vendavel ? "flex" : "none";
    elementos.campoPorcentagem.required = vendavel;
    if (!vendavel) {
      elementos.campoPorcentagem.value = "";
      elementos.campoPrecoVenda.value = "";
    }
    atualizarPreviewPrecoVenda();
  }

  // Preview local, só para feedback visual — o valor real vem do backend na resposta.
  function atualizarPreviewPrecoVenda() {
    if (!elementos.campoEVendavel.checked) return;
    const custo = moedaParaNumero(elementos.campoPrecoCusto.value);
    const porcentagem = parseFloat(elementos.campoPorcentagem.value);
    if (custo == null || isNaN(porcentagem)) {
      elementos.campoPrecoVenda.value = "";
      return;
    }
    const precoVenda = custo + (custo * porcentagem / 100);
    elementos.campoPrecoVenda.value = numeroParaMoeda(precoVenda);
  }

  // ---------- Tabela ----------

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
        nomeCategoria(produto.categoria_id).toLowerCase().includes(termoBusca)
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
        ? `R$ ${Number(produto.preco_venda).toFixed(2).replace(".", ",")}`
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
          <td>${nomeCategoria(produto.categoria_id)}</td>
          <td>${nomeSubcategoria(produto.subcategoria_id)}</td>
          <td>${rotuloTipo(produto)}</td>
          <td>${precoFormatado}</td>
          <td><span class="badge-estoque ${badgeEstoqueClasse}">${produto.estoque_atual}</span></td>
          <td>${produto.estoque_reservado ?? 0}</td>
          <td>${produto.estoque_minimo}</td>
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

  // ---------- Modal de visualização ----------

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
    document.getElementById("vis-categoria").textContent = nomeCategoria(produto.categoria_id);
    document.getElementById("vis-subcategoria").textContent = nomeSubcategoria(produto.subcategoria_id);
    document.getElementById("vis-unidade").textContent = nomeUnidade(produto.unidade_medida_id);
    document.getElementById("vis-tipo").textContent = rotuloTipo(produto);
    document.getElementById("vis-descricao").textContent = produto.descricao ?? "—";
    document.getElementById("vis-preco-custo").textContent = formatarMoeda(produto.preco_custo);
    document.getElementById("vis-porcentagem").textContent =
      produto.porcentagem != null ? `${produto.porcentagem}%` : "—";
    document.getElementById("vis-preco-venda").textContent = formatarMoeda(produto.preco_venda);
    document.getElementById("vis-estoque-atual").textContent = produto.estoque_atual;
    document.getElementById("vis-estoque-minimo").textContent = produto.estoque_minimo;
    document.getElementById("vis-estoque-reservado").textContent = produto.estoque_reservado ?? 0;
    document.getElementById("vis-estoque-disponivel").textContent =
      produto.estoque_disponivel ?? (produto.estoque_atual - (produto.estoque_reservado ?? 0));
    document.getElementById("vis-criado-em").textContent = formatarData(produto.created_at);

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  // ---------- Modal de criação/edição ----------

  async function abrirModal(produto = null) {
    elementos.form.reset();
    limparErrosForm();
    elementos.campoSubcategoria.innerHTML = `<option value="">Selecione a categoria primeiro...</option>`;
    elementos.campoSubcategoria.disabled = true;

    if (produto) {
      produtoEmEdicaoId = produto.id;
      elementos.modalTitulo.textContent = "Editar produto";
      document.getElementById("campo-nome").value = produto.nome;
      elementos.campoCategoria.value = produto.categoria_id;
      await atualizarSubcategoriasPorCategoria(produto.categoria_id, produto.subcategoria_id);
      elementos.campoUnidade.value = produto.unidade_medida_id;
      document.getElementById("campo-descricao").value = produto.descricao ?? "";
      elementos.campoEInsumo.checked = produto.e_insumo;
      elementos.campoEVendavel.checked = produto.e_vendavel;
      elementos.campoPrecoCusto.value = numeroParaMoeda(produto.preco_custo);
      if (produto.e_vendavel) {
        elementos.campoPorcentagem.value = produto.porcentagem ?? "";
      }
      document.getElementById("campo-estoque-minimo").value = produto.estoque_minimo;
      atualizarVisibilidadeCamposVenda();
    } else {
      produtoEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo produto";
      atualizarVisibilidadeCamposVenda();
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

    if (!dados.categoria_id) {
      elementos.campoCategoria.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.subcategoria_id) {
      elementos.campoSubcategoria.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.unidade_medida_id) {
      elementos.campoUnidade.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.e_insumo && !dados.e_vendavel) {
      document.getElementById("erro-tipo-produto").style.display = "block";
      valido = false;
    } else {
      document.getElementById("erro-tipo-produto").style.display = "none";
    }

    if (dados.preco_custo == null || dados.preco_custo < 0) {
      elementos.campoPrecoCusto.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (dados.e_vendavel && (dados.porcentagem == null || isNaN(dados.porcentagem))) {
      elementos.blocoPorcentagem.classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarProduto(evento) {
    evento.preventDefault();

    const eVendavel = elementos.campoEVendavel.checked;

    const dados = {
      nome: document.getElementById("campo-nome").value,
      categoria_id: parseInt(elementos.campoCategoria.value, 10) || null,
      subcategoria_id: parseInt(elementos.campoSubcategoria.value, 10) || null,
      unidade_medida_id: parseInt(elementos.campoUnidade.value, 10) || null,
      e_insumo: elementos.campoEInsumo.checked,
      e_vendavel: eVendavel,
      preco_custo: moedaParaNumero(elementos.campoPrecoCusto.value),
      porcentagem: eVendavel ? parseFloat(elementos.campoPorcentagem.value) : null,
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

  // ---------- Ações da tabela e abas ----------

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
      if (produto) await abrirModal(produto);
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

  // ---------- Listeners ----------

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

  elementos.campoCategoria.addEventListener("change", () => {
    atualizarSubcategoriasPorCategoria(elementos.campoCategoria.value || null);
  });
  elementos.campoEVendavel.addEventListener("change", atualizarVisibilidadeCamposVenda);
  elementos.campoPrecoCusto.addEventListener("input", atualizarPreviewPrecoVenda);
  elementos.campoPorcentagem.addEventListener("input", atualizarPreviewPrecoVenda);

  await carregarListasDeApoio();
  await carregarProdutos();
});