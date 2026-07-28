// Lógica da tela de Formas de Pagamento: CRUD simples com modal de cadastro/edição
// e modal de visualização somente leitura. Sem complexidade adicional de estoque
// ou máquina de estados — é o módulo mais direto do sistema.

let formasCache = [];
let abaAtivaForma = "ativos";
let formaEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-formas-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-forma"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-forma"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-forma"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  const rotuloTipo = {
    vista: "À vista",
    parcelado: "Parcelado",
    prazo: "A prazo"
  };

  async function carregarFormas() {
    try {
      formasCache = abaAtivaForma === "ativos"
        ? await formaPagamentoService.listar()
        : await formaPagamentoService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = formasCache.filter(f =>
      !termoBusca || f.descricao.toLowerCase().includes(termoBusca)
    );

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas.map(forma => {
      const badgeStatusClasse = forma.ativo ? "badge-status--ativo" : "badge-status--inativo";

      const botaoAcao = forma.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${forma.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${forma.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${forma.descricao}</td>
          <td>${rotuloTipo[forma.tipo] ?? forma.tipo}</td>
          <td>${forma.prazo_dias} ${forma.prazo_dias === 1 ? "dia" : "dias"}</td>
          <td>${Number(forma.taxa_percentual).toFixed(2).replace(".", ",")}%</td>
          <td><span class="badge-status ${badgeStatusClasse}">${forma.ativo ? "Ativa" : "Inativa"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${forma.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${forma.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(forma = null) {
    elementos.form.reset();
    limparErrosForm();

    if (forma) {
      formaEmEdicaoId = forma.id;
      elementos.modalTitulo.textContent = "Editar forma de pagamento";
      document.getElementById("campo-descricao").value = forma.descricao;
      document.getElementById("campo-tipo").value = forma.tipo;
      document.getElementById("campo-prazo").value = forma.prazo_dias;
      document.getElementById("campo-taxa").value = forma.taxa_percentual;
    } else {
      formaEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Nova forma de pagamento";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    formaEmEdicaoId = null;
  }

  function abrirModalVisualizacao(forma) {
    document.getElementById("vis-descricao").textContent = forma.descricao;
    document.getElementById("vis-status").textContent = forma.ativo ? "Ativa" : "Inativa";
    document.getElementById("vis-tipo").textContent = rotuloTipo[forma.tipo] ?? forma.tipo;
    document.getElementById("vis-prazo").textContent =
      `${forma.prazo_dias} ${forma.prazo_dias === 1 ? "dia" : "dias"}`;
    document.getElementById("vis-taxa").textContent =
      `${Number(forma.taxa_percentual).toFixed(2).replace(".", ",")}%`;

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

    if (!dados.descricao.trim()) {
      document.getElementById("campo-descricao").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.tipo) {
      document.getElementById("campo-tipo").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarForma(evento) {
    evento.preventDefault();

    const dados = {
      descricao: document.getElementById("campo-descricao").value,
      tipo: document.getElementById("campo-tipo").value,
      prazo_dias: parseInt(document.getElementById("campo-prazo").value || "0", 10),
      taxa_percentual: parseFloat(document.getElementById("campo-taxa").value || "0")
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (formaEmEdicaoId) {
        await formaPagamentoService.atualizar(formaEmEdicaoId, dados);
      } else {
        await formaPagamentoService.criar(dados);
      }
      fecharModal();
      await carregarFormas();
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
      const forma = formasCache.find(f => f.id === id);
      if (forma) abrirModalVisualizacao(forma);
    }

    if (acao === "editar") {
      const forma = formasCache.find(f => f.id === id);
      if (forma) abrirModal(forma);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar esta forma de pagamento? Ela não estará disponível para novos pedidos.")) return;
      try {
        await formaPagamentoService.desativar(id);
        await carregarFormas();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await formaPagamentoService.reativar(id);
        await carregarFormas();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaForma = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarFormas();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarForma);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarFormas();
});