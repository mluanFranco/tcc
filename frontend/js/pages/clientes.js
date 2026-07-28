// Lógica da tela de Clientes: busca dados via clienteService, renderiza a tabela,
// controla o modal de criação/edição, autocomplete de endereço via ViaCEP
// e o filtro de tipo de documento (CPF/CNPJ) conforme PF ou PJ.

let clientesCache = [];
let abaAtivaClientes = "ativos";
let clienteEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-clientes-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-cliente"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-cliente"),
    campoTipo: document.getElementById("campo-tipo"),
    labelDocumento: document.getElementById("label-documento"),
    campoDocumento: document.getElementById("campo-documento"),
    campoCep: document.getElementById("campo-cep"),
    cepStatus: document.getElementById("campo-cep-status"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-cliente"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  async function carregarClientes() {
    try {
      clientesCache = abaAtivaClientes === "ativos"
        ? await clienteService.listar()
        : await clienteService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const clientesFiltrados = clientesCache.filter(cliente => {
      if (!termoBusca) return true;
      return (
        cliente.nome.toLowerCase().includes(termoBusca) ||
        cliente.cpf_cnpj.includes(termoBusca)
      );
    });

    if (clientesFiltrados.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = clientesFiltrados.map(cliente => {
      const badgeStatusClasse = cliente.ativo ? "badge-status--ativo" : "badge-status--inativo";
      const cidadeUf = cliente.cidade ? `${cliente.cidade}${cliente.uf ? "/" + cliente.uf : ""}` : "—";

      const botaoAcao = cliente.ativo
        ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${cliente.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`
        : `<button class="botao-icone" data-acao="reativar" data-id="${cliente.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`;

      return `
        <tr>
          <td class="celula-nome">${cliente.nome}</td>
          <td>${cliente.tipo === "PJ" ? "CNPJ" : "CPF"}: ${cliente.cpf_cnpj}</td>
          <td>${cliente.telefone ?? "—"}</td>
          <td>${cidadeUf}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${cliente.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${cliente.id}" title="Visualizar" aria-label="Visualizar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="botao-icone" data-acao="editar" data-id="${cliente.id}" title="Editar" aria-label="Editar">
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

  function abrirModalVisualizacao(cliente) {
    document.getElementById("vis-nome").textContent = cliente.nome;
    document.getElementById("vis-status").textContent = cliente.ativo ? "Ativo" : "Inativo";
    document.getElementById("vis-tipo").textContent = cliente.tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";
    document.getElementById("vis-documento").textContent = cliente.cpf_cnpj;
    document.getElementById("vis-telefone").textContent = cliente.telefone ?? "—";
    document.getElementById("vis-email").textContent = cliente.email ?? "—";
    document.getElementById("vis-cep").textContent = cliente.cep ?? "—";
    document.getElementById("vis-logradouro").textContent = cliente.logradouro ?? "—";
    document.getElementById("vis-numero").textContent = cliente.numero ?? "—";
    document.getElementById("vis-complemento").textContent = cliente.complemento ?? "—";
    document.getElementById("vis-bairro").textContent = cliente.bairro ?? "—";
    document.getElementById("vis-cidade-uf").textContent = cliente.cidade
      ? `${cliente.cidade}${cliente.uf ? "/" + cliente.uf : ""}`
      : "—";
    document.getElementById("vis-criado-em").textContent = formatarData(cliente.created_at);

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  function atualizarLabelDocumento() {
    const tipo = elementos.campoTipo.value;
    elementos.labelDocumento.textContent = tipo === "PJ" ? "CNPJ *" : "CPF *";
    elementos.campoDocumento.placeholder = tipo === "PJ" ? "00.000.000/0000-00" : "000.000.000-00";
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

    // Move o foco para o número, já que é o único dado de endereço
    // que o ViaCEP nunca preenche e o usuário precisa digitar.
    document.getElementById("campo-numero").focus();
  }

  function abrirModal(cliente = null) {
    elementos.form.reset();
    limparErrosForm();
    limparCepStatus();

    if (cliente) {
      clienteEmEdicaoId = cliente.id;
      elementos.modalTitulo.textContent = "Editar cliente";
      document.getElementById("campo-nome").value = cliente.nome;
      elementos.campoTipo.value = cliente.tipo ?? "PF";
      elementos.campoDocumento.value = cliente.cpf_cnpj;
      document.getElementById("campo-telefone").value = cliente.telefone ?? "";
      document.getElementById("campo-email").value = cliente.email ?? "";
      elementos.campoCep.value = cliente.cep ?? "";
      document.getElementById("campo-logradouro").value = cliente.logradouro ?? "";
      document.getElementById("campo-numero").value = cliente.numero ?? "";
      document.getElementById("campo-complemento").value = cliente.complemento ?? "";
      document.getElementById("campo-bairro").value = cliente.bairro ?? "";
      document.getElementById("campo-cidade").value = cliente.cidade ?? "";
      document.getElementById("campo-uf").value = cliente.uf ?? "";
      document.getElementById("campo-ddd").value = cliente.ddd ?? "";
    } else {
      clienteEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo cliente";
      elementos.campoTipo.value = "PF";
    }

    atualizarLabelDocumento();
    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    clienteEmEdicaoId = null;
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

    if (!dados.cpf_cnpj.trim()) {
      elementos.campoDocumento.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarCliente(evento) {
    evento.preventDefault();

    const dados = {
      nome: document.getElementById("campo-nome").value,
      tipo: elementos.campoTipo.value,
      cpf_cnpj: elementos.campoDocumento.value,
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
      if (clienteEmEdicaoId) {
        await clienteService.atualizar(clienteEmEdicaoId, dados);
      } else {
        await clienteService.criar(dados);
      }
      fecharModal();
      await carregarClientes();
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
      const cliente = clientesCache.find(c => c.id === id);
      if (cliente) abrirModalVisualizacao(cliente);
    }

    if (acao === "editar") {
      const cliente = clientesCache.find(c => c.id === id);
      if (cliente) abrirModal(cliente);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar este cliente? Ele deixará de aparecer na listagem de ativos.")) return;
      try {
        await clienteService.desativar(id);
        await carregarClientes();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await clienteService.reativar(id);
        await carregarClientes();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaClientes = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarClientes();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarCliente);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.campoTipo.addEventListener("change", atualizarLabelDocumento);
  elementos.campoCep.addEventListener("input", tratarBuscaCep);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarClientes();
});