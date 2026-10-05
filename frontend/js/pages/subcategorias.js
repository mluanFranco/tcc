// Lógica da tela de Subcategorias: CRUD com dependência de Categoria (select
// dinâmico) e resolução do nome da categoria na listagem/visualização.

let subcategoriasCache = [];
let categoriasParaSelect = [];
let abaAtivaSubcategoria = "ativos";
let subcategoriaEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-subcategorias-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    campoCategoria: document.getElementById("campo-categoria"),
    modalOverlay: document.getElementById("modal-subcategoria"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-subcategoria"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-subcategoria"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  function nomeCategoria(categoriaId) {
    const categoria = categoriasParaSelect.find(c => c.id === categoriaId);
    return categoria ? categoria.nome : "—";
  }

  async function carregarCategoriasParaSelect() {
    try {
      categoriasParaSelect = await categoriaService.listar();
      elementos.campoCategoria.innerHTML =
        `<option value="">Selecione...</option>` +
        categoriasParaSelect.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
    } catch (erro) {
      alert("Não foi possível carregar as categorias: " + erro.message);
    }
  }

  async function carregarSubcategorias() {
    try {
      subcategoriasCache = abaAtivaSubcategoria === "ativos"
        ? await subcategoriaService.listar()
        : await subcategoriaService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = subcategoriasCache.filter(s => {
      if (!termoBusca) return true;
      const categoria = nomeCategoria(s.categoria_id).toLowerCase();
      return s.nome.toLowerCase().includes(termoBusca) || categoria.includes(termoBusca);
    });

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas.map(subcategoria => {
      const badgeStatusClasse = subcategoria.ativo ? "badge-status--ativo" : "badge-status--inativo";

      const botaoAcao = subcategoria.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${subcategoria.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${subcategoria.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${subcategoria.nome}</td>
          <td>${nomeCategoria(subcategoria.categoria_id)}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${subcategoria.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${subcategoria.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${subcategoria.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(subcategoria = null) {
    elementos.form.reset();
    limparErrosForm();

    if (subcategoria) {
      subcategoriaEmEdicaoId = subcategoria.id;
      elementos.modalTitulo.textContent = "Editar subcategoria";
      elementos.campoCategoria.value = subcategoria.categoria_id;
      document.getElementById("campo-nome").value = subcategoria.nome;
    } else {
      subcategoriaEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Nova subcategoria";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    subcategoriaEmEdicaoId = null;
  }

  function abrirModalVisualizacao(subcategoria) {
    document.getElementById("vis-nome").textContent = subcategoria.nome;
    document.getElementById("vis-status").textContent = subcategoria.ativo ? "Ativa" : "Inativa";
    document.getElementById("vis-categoria").textContent = nomeCategoria(subcategoria.categoria_id);
    document.getElementById("vis-criado-em").textContent =
      new Date(subcategoria.created_at).toLocaleDateString("pt-BR");

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  function limparErrosForm() {
    document.querySelectorAll(".campo-form").forEach(c => c.classList.remove("invalido"));
  }

  function validarForm(dados) {
    limparErrosForm();
    let valido = true;

    if (!dados.categoria_id) {
      elementos.campoCategoria.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.nome.trim()) {
      document.getElementById("campo-nome").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarSubcategoria(evento) {
    evento.preventDefault();

    const dados = {
      categoria_id: parseInt(elementos.campoCategoria.value, 10) || null,
      nome: document.getElementById("campo-nome").value
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (subcategoriaEmEdicaoId) {
        await subcategoriaService.atualizar(subcategoriaEmEdicaoId, dados);
      } else {
        await subcategoriaService.criar(dados);
      }
      fecharModal();
      await carregarSubcategorias();
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
      const subcategoria = subcategoriasCache.find(s => s.id === id);
      if (subcategoria) abrirModalVisualizacao(subcategoria);
    }

    if (acao === "editar") {
      const subcategoria = subcategoriasCache.find(s => s.id === id);
      if (subcategoria) abrirModal(subcategoria);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar esta subcategoria? Produtos vinculados não serão afetados.")) return;
      try {
        await subcategoriaService.desativar(id);
        await carregarSubcategorias();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await subcategoriaService.reativar(id);
        await carregarSubcategorias();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaSubcategoria = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarSubcategorias();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarSubcategoria);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarCategoriasParaSelect();
  await carregarSubcategorias();
});