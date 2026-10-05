// Lógica da tela de Categorias: CRUD simples com modal de cadastro/edição
// e modal de visualização somente leitura.

let categoriasCache = [];
let abaAtivaCategoria = "ativos";
let categoriaEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-categorias-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-categoria"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-categoria"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-categoria"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  async function carregarCategorias() {
    try {
      categoriasCache = abaAtivaCategoria === "ativos"
        ? await categoriaService.listar()
        : await categoriaService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = categoriasCache.filter(c =>
      !termoBusca || c.nome.toLowerCase().includes(termoBusca)
    );

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas.map(categoria => {
      const badgeStatusClasse = categoria.ativo ? "badge-status--ativo" : "badge-status--inativo";

      const botaoAcao = categoria.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${categoria.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${categoria.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${categoria.nome}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${categoria.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${categoria.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${categoria.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(categoria = null) {
    elementos.form.reset();
    limparErrosForm();

    if (categoria) {
      categoriaEmEdicaoId = categoria.id;
      elementos.modalTitulo.textContent = "Editar categoria";
      document.getElementById("campo-nome").value = categoria.nome;
    } else {
      categoriaEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Nova categoria";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    categoriaEmEdicaoId = null;
  }

  function abrirModalVisualizacao(categoria) {
    document.getElementById("vis-nome").textContent = categoria.nome;
    document.getElementById("vis-status").textContent = categoria.ativo ? "Ativa" : "Inativa";
    document.getElementById("vis-criado-em").textContent =
      new Date(categoria.created_at).toLocaleDateString("pt-BR");

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

    if (!dados.nome.trim()) {
      document.getElementById("campo-nome").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarCategoria(evento) {
    evento.preventDefault();

    const dados = {
      nome: document.getElementById("campo-nome").value
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (categoriaEmEdicaoId) {
        await categoriaService.atualizar(categoriaEmEdicaoId, dados);
      } else {
        await categoriaService.criar(dados);
      }
      fecharModal();
      await carregarCategorias();
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
      const categoria = categoriasCache.find(c => c.id === id);
      if (categoria) abrirModalVisualizacao(categoria);
    }

    if (acao === "editar") {
      const categoria = categoriasCache.find(c => c.id === id);
      if (categoria) abrirModal(categoria);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar esta categoria? Produtos e subcategorias vinculados não serão afetados, mas ela deixará de aparecer para novos cadastros.")) return;
      try {
        await categoriaService.desativar(id);
        await carregarCategorias();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await categoriaService.reativar(id);
        await carregarCategorias();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaCategoria = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarCategorias();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarCategoria);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarCategorias();
});