// Lógica da tela de Unidades de Medida: CRUD simples com modal de
// cadastro/edição e modal de visualização somente leitura.

let unidadesCache = [];
let abaAtivaUnidade = "ativos";
let unidadeEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-unidades-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-unidade"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-unidade"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-unidade"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  async function carregarUnidades() {
    try {
      unidadesCache = abaAtivaUnidade === "ativos"
        ? await unidadeMedidaService.listar()
        : await unidadeMedidaService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = unidadesCache.filter(u =>
      !termoBusca ||
      u.nome.toLowerCase().includes(termoBusca) ||
      u.sigla.toLowerCase().includes(termoBusca)
    );

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas.map(unidade => {
      const badgeStatusClasse = unidade.ativo ? "badge-status--ativo" : "badge-status--inativo";

      const botaoAcao = unidade.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${unidade.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${unidade.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${unidade.nome}</td>
          <td>${unidade.sigla}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${unidade.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${unidade.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${unidade.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(unidade = null) {
    elementos.form.reset();
    limparErrosForm();

    if (unidade) {
      unidadeEmEdicaoId = unidade.id;
      elementos.modalTitulo.textContent = "Editar unidade de medida";
      document.getElementById("campo-nome").value = unidade.nome;
      document.getElementById("campo-sigla").value = unidade.sigla;
    } else {
      unidadeEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Nova unidade de medida";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    unidadeEmEdicaoId = null;
  }

  function abrirModalVisualizacao(unidade) {
    document.getElementById("vis-nome").textContent = unidade.nome;
    document.getElementById("vis-sigla").textContent = unidade.sigla;
    document.getElementById("vis-status").textContent = unidade.ativo ? "Ativa" : "Inativa";
    document.getElementById("vis-criado-em").textContent =
      new Date(unidade.created_at).toLocaleDateString("pt-BR");

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

    if (!dados.sigla.trim()) {
      document.getElementById("campo-sigla").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarUnidade(evento) {
    evento.preventDefault();

    const dados = {
      nome: document.getElementById("campo-nome").value,
      sigla: document.getElementById("campo-sigla").value
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (unidadeEmEdicaoId) {
        await unidadeMedidaService.atualizar(unidadeEmEdicaoId, dados);
      } else {
        await unidadeMedidaService.criar(dados);
      }
      fecharModal();
      await carregarUnidades();
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
      const unidade = unidadesCache.find(u => u.id === id);
      if (unidade) abrirModalVisualizacao(unidade);
    }

    if (acao === "editar") {
      const unidade = unidadesCache.find(u => u.id === id);
      if (unidade) abrirModal(unidade);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar esta unidade de medida? Produtos vinculados não serão afetados.")) return;
      try {
        await unidadeMedidaService.desativar(id);
        await carregarUnidades();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await unidadeMedidaService.reativar(id);
        await carregarUnidades();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaUnidade = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarUnidades();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarUnidade);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarUnidades();
});