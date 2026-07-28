// Lógica da tela de Fornecedores: busca dados via fornecedorService, renderiza a tabela,
// controla o modal de criação/edição e o autocomplete de endereço via ViaCEP.

let fornecedoresCache = [];
let abaAtivaFornecedores = "ativos";
let fornecedorEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-fornecedores-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-fornecedor"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-fornecedor"),
    campoCep: document.getElementById("campo-cep"),
    cepStatus: document.getElementById("campo-cep-status"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-fornecedor"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  async function carregarFornecedores() {
    try {
      fornecedoresCache = abaAtivaFornecedores === "ativos"
        ? await fornecedorService.listar()
        : await fornecedorService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const fornecedoresFiltrados = fornecedoresCache.filter(fornecedor => {
      if (!termoBusca) return true;
      return (
        fornecedor.nome.toLowerCase().includes(termoBusca) ||
        fornecedor.cnpj.includes(termoBusca)
      );
    });

    if (fornecedoresFiltrados.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = fornecedoresFiltrados.map(fornecedor => {
      const badgeStatusClasse = fornecedor.ativo ? "badge-status--ativo" : "badge-status--inativo";
      const cidadeUf = fornecedor.cidade ? `${fornecedor.cidade}${fornecedor.uf ? "/" + fornecedor.uf : ""}` : "—";

      const botaoAcao = fornecedor.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${fornecedor.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${fornecedor.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${fornecedor.nome}</td>
          <td>${fornecedor.cnpj}</td>
          <td>${fornecedor.telefone ?? "—"}</td>
          <td>${cidadeUf}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${fornecedor.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${fornecedor.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${fornecedor.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  function abrirModalVisualizacao(fornecedor) {
    document.getElementById("vis-nome").textContent = fornecedor.nome;
    document.getElementById("vis-status").textContent = fornecedor.ativo ? "Ativo" : "Inativo";
    document.getElementById("vis-cnpj").textContent = fornecedor.cnpj;
    document.getElementById("vis-telefone").textContent = fornecedor.telefone ?? "—";
    document.getElementById("vis-email").textContent = fornecedor.email ?? "—";
    document.getElementById("vis-cep").textContent = fornecedor.cep ?? "—";
    document.getElementById("vis-logradouro").textContent = fornecedor.logradouro ?? "—";
    document.getElementById("vis-numero").textContent = fornecedor.numero ?? "—";
    document.getElementById("vis-complemento").textContent = fornecedor.complemento ?? "—";
    document.getElementById("vis-bairro").textContent = fornecedor.bairro ?? "—";
    document.getElementById("vis-cidade-uf").textContent = fornecedor.cidade
      ? `${fornecedor.cidade}${fornecedor.uf ? "/" + fornecedor.uf : ""}`
      : "—";
    document.getElementById("vis-criado-em").textContent = formatarData(fornecedor.created_at);

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  function limparCepStatus() {
    elementos.cepStatus.className = "campo-cep-status";
    elementos.cepStatus.textContent = "";
  }

  function definirCepStatus(tipo, texto) {
    elementos.cepStatus.className = `campo-cep-status visivel campo-cep-status--${tipo}`;
    elementos.cepStatus.textContent = texto;
  }

  async function tratarBuscaCep() {
    const cepDigitado = elementos.campoCep.value.replace(/\D/g, "");

    if (cepDigitado.length !== 8) {
      limparCepStatus();
      return;
    }

    definirCepStatus("buscando", "Buscando...");

    const endereco = await viaCepService.buscarPorCep(cepDigitado);

    if (!endereco) {
      definirCepStatus("nao-encontrado", "CEP não encontrado");
      return;
    }

    document.getElementById("campo-logradouro").value = endereco.logradouro ?? "";
    document.getElementById("campo-bairro").value = endereco.bairro ?? "";
    document.getElementById("campo-cidade").value = endereco.cidade ?? "";
    document.getElementById("campo-uf").value = endereco.uf ?? "";
    document.getElementById("campo-ddd").value = endereco.ddd ?? "";

    definirCepStatus("encontrado", "Endereço encontrado");
    document.getElementById("campo-numero").focus();
  }

  function abrirModal(fornecedor = null) {
    elementos.form.reset();
    limparErrosForm();
    limparCepStatus();

    if (fornecedor) {
      fornecedorEmEdicaoId = fornecedor.id;
      elementos.modalTitulo.textContent = "Editar fornecedor";
      document.getElementById("campo-nome").value = fornecedor.nome;
      document.getElementById("campo-cnpj").value = fornecedor.cnpj;
      document.getElementById("campo-telefone").value = fornecedor.telefone ?? "";
      document.getElementById("campo-email").value = fornecedor.email ?? "";
      elementos.campoCep.value = fornecedor.cep ?? "";
      document.getElementById("campo-logradouro").value = fornecedor.logradouro ?? "";
      document.getElementById("campo-numero").value = fornecedor.numero ?? "";
      document.getElementById("campo-complemento").value = fornecedor.complemento ?? "";
      document.getElementById("campo-bairro").value = fornecedor.bairro ?? "";
      document.getElementById("campo-cidade").value = fornecedor.cidade ?? "";
      document.getElementById("campo-uf").value = fornecedor.uf ?? "";
      document.getElementById("campo-ddd").value = fornecedor.ddd ?? "";
    } else {
      fornecedorEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo fornecedor";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    fornecedorEmEdicaoId = null;
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

    if (!dados.cnpj.trim()) {
      document.getElementById("campo-cnpj").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarFornecedor(evento) {
    evento.preventDefault();

    const dados = {
      nome: document.getElementById("campo-nome").value,
      cnpj: document.getElementById("campo-cnpj").value,
      telefone: document.getElementById("campo-telefone").value || null,
      email: document.getElementById("campo-email").value || null,
      cep: elementos.campoCep.value || null,
      logradouro: document.getElementById("campo-logradouro").value || null,
      numero: document.getElementById("campo-numero").value || null,
      complemento: document.getElementById("campo-complemento").value || null,
      bairro: document.getElementById("campo-bairro").value || null,
      cidade: document.getElementById("campo-cidade").value || null,
      uf: document.getElementById("campo-uf").value || null,
      ddd: document.getElementById("campo-ddd").value || null
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (fornecedorEmEdicaoId) {
        await fornecedorService.atualizar(fornecedorEmEdicaoId, dados);
      } else {
        await fornecedorService.criar(dados);
      }
      fecharModal();
      await carregarFornecedores();
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
      const fornecedor = fornecedoresCache.find(f => f.id === id);
      if (fornecedor) abrirModalVisualizacao(fornecedor);
    }

    if (acao === "editar") {
      const fornecedor = fornecedoresCache.find(f => f.id === id);
      if (fornecedor) abrirModal(fornecedor);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar este fornecedor? Ele deixará de aparecer na listagem de ativos.")) return;
      try {
        await fornecedorService.desativar(id);
        await carregarFornecedores();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await fornecedorService.reativar(id);
        await carregarFornecedores();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaFornecedores = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarFornecedores();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarFornecedor);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.campoCep.addEventListener("input", tratarBuscaCep);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarFornecedores();
});