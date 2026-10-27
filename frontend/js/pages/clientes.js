// Lógica da tela de Clientes: lista, modal de criação/edição, busca de endereço pelo ViaCEP
// e validação do documento conforme PF ou PJ.
//
// O cliente tem um endereço principal (obrigatório) e pode ter endereços de entrega. O backend guarda os
// endereços em /clientes/{id}/enderecos; aqui o formulário edita o principal e o modal de detalhes
// mostra os de entrega.

let clientesCache = [];
let abaAtivaClientes = "ativos";
let clienteEmEdicaoId = null;
let enderecoPrincipalEmEdicaoId = null;
let enderecoEntregaEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  // Cadastros: qualquer usuário logado consulta; criar, editar e desativar exigem cadastros.editar.
  const podeEditar = temPermissao("cadastros.editar");

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-clientes-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    estadoCarregando: document.getElementById("estado-carregando"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-cliente"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-cliente"),
    formEndereco: document.getElementById("form-endereco"),
    campoTipo: document.getElementById("campo-tipo"),
    labelDocumento: document.getElementById("label-documento"),
    campoDocumento: document.getElementById("campo-documento"),
    campoCep: document.getElementById("campo-cep"),
    cepStatus: document.getElementById("campo-cep-status"),
    modalEnderecoOverlay: document.getElementById("modal-endereco"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-cliente"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  const campo = (id) => document.getElementById(id);

  // ---------- Dados do endereço principal ----------

  function enderecoPrincipal(cliente) {
    const lista = cliente.enderecos || [];
    return lista.find(e => e.tipo === "principal") || null;
  }

  function cidadeUf(endereco) {
    if (!endereco || !endereco.cidade) return "—";
    return `${endereco.cidade}${endereco.uf ? "/" + endereco.uf : ""}`;
  }

  function textoEndereco(e) {
    const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
    const complemento = e.complemento ? ` — ${e.complemento}` : "";
    const bairro = e.bairro ? `${e.bairro}, ` : "";
    return `${rua}${complemento}. ${bairro}${cidadeUf(e)}. CEP ${formatarCep(e.cep)}`;
  }

  // ---------- Tabela ----------

  let requisicaoAtual = 0;

  async function carregarClientes() {
    const minha = ++requisicaoAtual;
    elementos.estadoCarregando.style.display = "block";
    elementos.estadoVazio.style.display = "none";
    elementos.tabelaCorpo.innerHTML = "";
    try {
      const lista = abaAtivaClientes === "ativos"
        ? await clienteService.listar()
        : await clienteService.listarInativos();
      if (minha !== requisicaoAtual) return;   // o usuário já trocou de aba
      clientesCache = lista;
      elementos.estadoCarregando.style.display = "none";
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      elementos.estadoCarregando.style.display = "none";
      toast.erro(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();
    const termoDocumento = termoBusca.replace(/[^0-9a-z]/g, "");

    const clientesFiltrados = clientesCache.filter(cliente => {
      if (!termoBusca) return true;
      return (
        cliente.nome.toLowerCase().includes(termoBusca) ||
        (termoDocumento && cliente.cpf_cnpj.toLowerCase().includes(termoDocumento))
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
      const nome = escaparHtml(cliente.nome);
      const rotuloDocumento = cliente.tipo === "PJ" ? "CNPJ" : "CPF";

      let botoesEdicao = "";
      if (podeEditar) {
        const botaoAtivacao = cliente.ativo
          ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${cliente.id}" title="Desativar" aria-label="Desativar ${nome}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
             </button>`
          : `<button class="botao-icone" data-acao="reativar" data-id="${cliente.id}" title="Reativar" aria-label="Reativar ${nome}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
             </button>`;
        botoesEdicao = `
            <button class="botao-icone" data-acao="editar" data-id="${cliente.id}" title="Editar" aria-label="Editar ${nome}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAtivacao}`;
      }

      return `
        <tr>
          <td class="celula-nome">${nome}</td>
          <td>${rotuloDocumento}: ${escaparHtml(formatarDocumento(cliente.cpf_cnpj))}</td>
          <td>${escaparHtml(formatarTelefone(cliente.telefone))}</td>
          <td>${escaparHtml(cidadeUf(enderecoPrincipal(cliente)))}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${cliente.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${cliente.id}" title="Visualizar" aria-label="Visualizar ${nome}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>${botoesEdicao}
          </td>
        </tr>
      `;
    }).join("");
  }

  // ---------- Modal de visualização ----------

  function abrirModalVisualizacao(cliente) {
    const principal = enderecoPrincipal(cliente) || {};
    campo("vis-nome").textContent = cliente.nome;
    campo("vis-status").textContent = cliente.ativo ? "Ativo" : "Inativo";
    campo("vis-tipo").textContent = cliente.tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";
    campo("vis-documento").textContent = formatarDocumento(cliente.cpf_cnpj);
    campo("vis-telefone").textContent = formatarTelefone(cliente.telefone);
    campo("vis-email").textContent = cliente.email ?? "—";
    campo("vis-cep").textContent = principal.cep ? formatarCep(principal.cep) : "—";
    campo("vis-logradouro").textContent = principal.logradouro ?? "—";
    campo("vis-numero").textContent = principal.numero ?? "—";
    campo("vis-complemento").textContent = principal.complemento ?? "—";
    campo("vis-bairro").textContent = principal.bairro ?? "—";
    campo("vis-cidade-uf").textContent = cidadeUf(principal);
    campo("vis-criado-em").textContent = formatarData(cliente.created_at);

    const entregas = (cliente.enderecos || []).filter(e => e.tipo === "entrega");
    const lista = campo("vis-entregas");
    lista.innerHTML = "";
    entregas.forEach(e => {
      const li = document.createElement("li");
      li.textContent = textoEndereco(e);   // textContent: o texto do endereço nunca vira HTML
      lista.appendChild(li);
    });
    campo("bloco-vis-entregas").hidden = entregas.length === 0;

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  // ---------- Documento e CEP ----------

  function atualizarLabelDocumento() {
    const tipo = elementos.campoTipo.value;
    elementos.labelDocumento.textContent = tipo === "PJ" ? "CNPJ *" : "CPF *";
    elementos.campoDocumento.placeholder = tipo === "PJ" ? "00.000.000/0000-00" : "000.000.000-00";
    elementos.campoDocumento.value = mascararDocumento(elementos.campoDocumento.value);   // reencaixa ao trocar PF/PJ
  }

  const mascararDocumento = (valor) => (elementos.campoTipo.value === "PJ" ? mascararCnpj(valor) : mascararCpf(valor));

  function limparStatusCep(statusEl) {
    statusEl.className = "campo-cep-status";
    statusEl.textContent = "";
  }

  function definirStatusCep(statusEl, tipo, texto) {
    statusEl.className = `campo-cep-status visivel campo-cep-status--${tipo}`;
    statusEl.textContent = texto;
  }

  const limparCepStatus = () => limparStatusCep(elementos.cepStatus);

  // Consulta o ViaCEP e preenche os campos. `ids` diz quais campos (principal ou entrega) receber o resultado.
  async function buscarCepEPreencher(inputCep, statusEl, ids) {
    const cepDigitado = inputCep.value.replace(/\D/g, "");

    if (cepDigitado.length !== 8) {
      limparStatusCep(statusEl);
      return;
    }

    definirStatusCep(statusEl, "buscando", "Buscando...");

    const endereco = await viaCepService.buscarPorCep(cepDigitado);

    if (inputCep.value.replace(/\D/g, "") !== cepDigitado) return;   // o CEP mudou durante a consulta

    if (!endereco) {
      definirStatusCep(statusEl, "nao-encontrado", "CEP não encontrado");
      return;
    }

    campo(ids.logradouro).value = endereco.logradouro ?? "";
    campo(ids.bairro).value = endereco.bairro ?? "";
    campo(ids.cidade).value = endereco.cidade ?? "";
    campo(ids.uf).value = endereco.uf ?? "";
    campo(ids.ddd).value = endereco.ddd ?? "";

    definirStatusCep(statusEl, "encontrado", "Endereço encontrado");

    // O número é o único dado que o ViaCEP nunca preenche.
    campo(ids.numero).focus();
  }

  const tratarBuscaCep = () => buscarCepEPreencher(elementos.campoCep, elementos.cepStatus, {
    logradouro: "campo-logradouro", bairro: "campo-bairro", cidade: "campo-cidade",
    uf: "campo-uf", ddd: "campo-ddd", numero: "campo-numero"
  });

  const tratarBuscaCepEndereco = () => buscarCepEPreencher(campo("end-cep"), campo("end-cep-status"), {
    logradouro: "end-logradouro", bairro: "end-bairro", cidade: "end-cidade",
    uf: "end-uf", ddd: "end-ddd", numero: "end-numero"
  });

  // ---------- Modal de criação/edição ----------

  function abrirModal(cliente = null) {
    elementos.form.reset();
    limparErrosForm();
    limparCepStatus();
    enderecoPrincipalEmEdicaoId = null;

    if (cliente) {
      const principal = enderecoPrincipal(cliente) || {};
      clienteEmEdicaoId = cliente.id;
      enderecoPrincipalEmEdicaoId = principal.id ?? null;
      elementos.modalTitulo.textContent = "Editar cliente";
      campo("campo-nome").value = cliente.nome;
      elementos.campoTipo.value = cliente.tipo ?? "PF";
      elementos.campoDocumento.value = formatarDocumento(cliente.cpf_cnpj);
      campo("campo-telefone").value = cliente.telefone ? mascararTelefone(cliente.telefone) : "";
      campo("campo-email").value = cliente.email ?? "";
      elementos.campoCep.value = principal.cep ? formatarCep(principal.cep) : "";
      campo("campo-logradouro").value = principal.logradouro ?? "";
      campo("campo-numero").value = principal.numero ?? "";
      campo("campo-complemento").value = principal.complemento ?? "";
      campo("campo-bairro").value = principal.bairro ?? "";
      campo("campo-cidade").value = principal.cidade ?? "";
      campo("campo-uf").value = principal.uf ?? "";
      campo("campo-ddd").value = principal.ddd ?? "";
    } else {
      clienteEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo cliente";
      elementos.campoTipo.value = "PF";
    }

    atualizarLabelDocumento();
    campo("dica-entregas-novo").hidden = Boolean(cliente);
    campo("area-entregas").hidden = !cliente;
    if (cliente) renderizarEntregasDoForm();
    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    fecharModalEndereco();
    clienteEmEdicaoId = null;
    enderecoPrincipalEmEdicaoId = null;
  }

  // ---------- Endereços de entrega (dentro do modal de edição) ----------
  // Cada operação grava na hora, em /clientes/{id}/enderecos, independente do botão Salvar do cliente.

  function renderizarEntregasDoForm() {
    const cliente = clientesCache.find(c => c.id === clienteEmEdicaoId);
    const entregas = ((cliente && cliente.enderecos) || []).filter(e => e.tipo === "entrega");
    const lista = campo("lista-entregas-form");
    lista.innerHTML = "";
    entregas.forEach(e => {
      const li = document.createElement("li");
      const texto = document.createElement("span");
      texto.className = "endereco-texto";
      texto.textContent = textoEndereco(e);   // textContent: o texto do endereço nunca vira HTML
      const acoes = document.createElement("span");
      acoes.className = "endereco-acoes";
      acoes.innerHTML = `
        <button type="button" class="botao-icone" data-end-acao="editar" data-end-id="${e.id}" title="Editar endereço" aria-label="Editar endereço">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button type="button" class="botao-icone botao-icone--perigo" data-end-acao="remover" data-end-id="${e.id}" title="Remover endereço" aria-label="Remover endereço">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
        </button>`;
      li.append(texto, acoes);
      lista.appendChild(li);
    });
    campo("vazio-entregas-form").hidden = entregas.length > 0;
  }

  // Depois de mexer num endereço, relê o cliente: a lista do modal e a da tabela passam a refletir o banco.
  async function atualizarClienteNoCache(id) {
    const atualizado = await clienteService.buscarPorId(id);
    const posicao = clientesCache.findIndex(c => c.id === id);
    if (posicao >= 0) clientesCache[posicao] = atualizado;
    renderizarTabela();
    if (clienteEmEdicaoId === id) renderizarEntregasDoForm();
  }

  function abrirModalEndereco(endereco = null) {
    elementos.formEndereco.reset();
    elementos.formEndereco.querySelectorAll(".campo-form").forEach(c => c.classList.remove("invalido"));
    limparStatusCep(campo("end-cep-status"));
    enderecoEntregaEmEdicaoId = endereco ? endereco.id : null;
    campo("modal-endereco-titulo").textContent = endereco ? "Editar endereço de entrega" : "Novo endereço de entrega";
    if (endereco) {
      campo("end-cep").value = endereco.cep ? formatarCep(endereco.cep) : "";
      campo("end-logradouro").value = endereco.logradouro ?? "";
      campo("end-numero").value = endereco.numero ?? "";
      campo("end-complemento").value = endereco.complemento ?? "";
      campo("end-bairro").value = endereco.bairro ?? "";
      campo("end-cidade").value = endereco.cidade ?? "";
      campo("end-uf").value = endereco.uf ?? "";
      campo("end-ddd").value = endereco.ddd ?? "";
    }
    elementos.modalEnderecoOverlay.classList.add("aberto");
    campo("end-cep").focus();
  }

  function fecharModalEndereco() {
    elementos.modalEnderecoOverlay.classList.remove("aberto");
    enderecoEntregaEmEdicaoId = null;
  }

  function lerEnderecoDoModal() {
    return {
      cep: campo("end-cep").value,
      logradouro: campo("end-logradouro").value,
      numero: campo("end-numero").value,
      complemento: campo("end-complemento").value.trim() || null,
      bairro: campo("end-bairro").value.trim() || null,
      cidade: campo("end-cidade").value,
      uf: campo("end-uf").value.trim().toUpperCase(),
      ddd: campo("end-ddd").value.trim() || null
    };
  }

  function validarEndereco(e) {
    const marcar = (id) => campo(id).closest(".campo-form").classList.add("invalido");
    elementos.formEndereco.querySelectorAll(".campo-form").forEach(c => c.classList.remove("invalido"));
    const problemas = [];
    if (e.cep.replace(/\D/g, "").length !== 8) { marcar("end-cep"); problemas.push("Informe o CEP com 8 números."); }
    if (!e.logradouro.trim()) { marcar("end-logradouro"); problemas.push("Informe o logradouro."); }
    if (!e.numero.trim()) { marcar("end-numero"); problemas.push("Informe o número (use S/N se não houver)."); }
    if (!e.cidade.trim()) { marcar("end-cidade"); problemas.push("Informe a cidade."); }
    if (!/^[A-Za-z]{2}$/.test(e.uf.trim())) { marcar("end-uf"); problemas.push("Informe a UF com 2 letras."); }
    if (problemas.length) toast.erro(problemas[0] + (problemas.length > 1 ? ` (mais ${problemas.length - 1} a corrigir)` : ""));
    return problemas.length === 0;
  }

  async function salvarEndereco(evento) {
    evento.preventDefault();
    const dados = lerEnderecoDoModal();
    if (!validarEndereco(dados)) return;

    const clienteId = clienteEmEdicaoId;
    const botao = campo("modal-endereco-salvar");
    botao.disabled = true;
    botao.textContent = "Salvando...";
    try {
      if (enderecoEntregaEmEdicaoId) {
        await clienteService.atualizarEndereco(clienteId, enderecoEntregaEmEdicaoId, dados);
      } else {
        await clienteService.criarEndereco(clienteId, { ...dados, tipo: "entrega" });
      }
      const editando = Boolean(enderecoEntregaEmEdicaoId);
      fecharModalEndereco();
      toast.sucesso(editando ? "Endereço de entrega atualizado." : "Endereço de entrega adicionado.");
      await atualizarClienteNoCache(clienteId);
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      botao.disabled = false;
      botao.textContent = "Salvar endereço";
    }
  }

  async function tratarAcaoEntrega(evento) {
    const botao = evento.target.closest("button[data-end-acao]");
    if (!botao) return;
    const cliente = clientesCache.find(c => c.id === clienteEmEdicaoId);
    const endereco = ((cliente && cliente.enderecos) || []).find(e => e.id === Number(botao.dataset.endId));
    if (!endereco) return;

    if (botao.dataset.endAcao === "editar") {
      abrirModalEndereco(endereco);
      return;
    }

    const confirmado = await confirmarAcao({
      titulo: "Remover endereço de entrega",
      mensagem: "Este endereço deixará de ser oferecido em novos pedidos. Pedidos antigos continuam mostrando o endereço em que foram entregues.",
      textoConfirmar: "Remover",
      perigo: true
    });
    if (!confirmado) return;
    const clienteId = clienteEmEdicaoId;
    try {
      await clienteService.desativarEndereco(clienteId, endereco.id);
      toast.sucesso("Endereço de entrega removido.");
      await atualizarClienteNoCache(clienteId);
    } catch (erro) {
      toast.erro(erro.message);
    }
  }

  function limparErrosForm() {
    document.querySelectorAll(".campo-form").forEach(c => c.classList.remove("invalido"));
  }

  function marcarInvalido(idCampo) {
    campo(idCampo).closest(".campo-form").classList.add("invalido");
  }

  // Confere o que o backend também confere, para o usuário ver o problema antes de enviar.
  function validarForm(dados) {
    limparErrosForm();
    const problemas = [];

    if (!dados.nome.trim()) { marcarInvalido("campo-nome"); problemas.push("Informe o nome."); }

    const documento = dados.cpf_cnpj.replace(/[^0-9a-zA-Z]/g, "");
    if (dados.tipo === "PF" && !/^\d{11}$/.test(documento)) {
      marcarInvalido("campo-documento"); problemas.push("O CPF deve ter 11 números.");
    } else if (dados.tipo === "PJ" && documento.length !== 14) {
      marcarInvalido("campo-documento"); problemas.push("O CNPJ deve ter 14 caracteres.");
    }

    const e = dados.endereco;
    if (e.cep.replace(/\D/g, "").length !== 8) { marcarInvalido("campo-cep"); problemas.push("Informe o CEP com 8 números."); }
    if (!e.logradouro.trim()) { marcarInvalido("campo-logradouro"); problemas.push("Informe o logradouro."); }
    if (!e.numero.trim()) { marcarInvalido("campo-numero"); problemas.push("Informe o número (use S/N se não houver)."); }
    if (!e.cidade.trim()) { marcarInvalido("campo-cidade"); problemas.push("Informe a cidade."); }
    if (!/^[A-Za-z]{2}$/.test(e.uf.trim())) { marcarInvalido("campo-uf"); problemas.push("Informe a UF com 2 letras."); }

    if (problemas.length) toast.erro(problemas[0] + (problemas.length > 1 ? ` (mais ${problemas.length - 1} a corrigir)` : ""));
    return problemas.length === 0;
  }

  function lerFormulario() {
    return {
      nome: campo("campo-nome").value,
      tipo: elementos.campoTipo.value,
      cpf_cnpj: elementos.campoDocumento.value,
      telefone: campo("campo-telefone").value.trim() || null,
      email: campo("campo-email").value.trim() || null,
      endereco: {
        cep: elementos.campoCep.value,
        logradouro: campo("campo-logradouro").value,
        numero: campo("campo-numero").value,
        complemento: campo("campo-complemento").value.trim() || null,
        bairro: campo("campo-bairro").value.trim() || null,
        cidade: campo("campo-cidade").value,
        uf: campo("campo-uf").value.trim().toUpperCase(),
        ddd: campo("campo-ddd").value.trim() || null
      }
    };
  }

  async function salvarCliente(evento) {
    evento.preventDefault();

    const dados = lerFormulario();
    if (!validarForm(dados)) return;

    const botaoSalvar = campo("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    const dadosCliente = { nome: dados.nome, tipo: dados.tipo, cpf_cnpj: dados.cpf_cnpj, telefone: dados.telefone, email: dados.email };

    try {
      if (clienteEmEdicaoId) {
        await clienteService.atualizar(clienteEmEdicaoId, dadosCliente);
        try {
          if (enderecoPrincipalEmEdicaoId) {
            await clienteService.atualizarEndereco(clienteEmEdicaoId, enderecoPrincipalEmEdicaoId, dados.endereco);
          } else {
            await clienteService.criarEndereco(clienteEmEdicaoId, { ...dados.endereco, tipo: "principal" });
          }
        } catch (erroEndereco) {
          // Os dados do cliente já foram gravados; só o endereço falhou.
          await carregarClientes();
          toast.erro("Os dados do cliente foram salvos, mas o endereço não: " + erroEndereco.message);
          return;
        }
      } else {
        await clienteService.criar({ ...dadosCliente, endereco_principal: dados.endereco });
      }
      const editando = !!clienteEmEdicaoId;
      fecharModal();
      toast.sucesso(editando ? "Cliente atualizado." : "Cliente cadastrado.");
      await carregarClientes();
    } catch (erro) {
      toast.erro(erro.message);
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
    const cliente = clientesCache.find(c => c.id === id);

    if (acao === "visualizar") {
      if (cliente) abrirModalVisualizacao(cliente);
      return;
    }

    if (!podeEditar) return;   // o backend também bloqueia; aqui só evita ações sem botão visível

    if (acao === "editar") {
      if (cliente) abrirModal(cliente);
    }

    if (acao === "desativar") {
      const confirmado = await confirmarAcao({
        titulo: "Desativar cliente",
        mensagem: `"${cliente ? cliente.nome : "Este cliente"}" deixará de aparecer na listagem de ativos. Você poderá reativá-lo depois.`,
        textoConfirmar: "Desativar",
        perigo: true
      });
      if (!confirmado) return;
      try {
        await clienteService.desativar(id);
        toast.sucesso("Cliente desativado.");
        await carregarClientes();
      } catch (erro) {
        toast.erro(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await clienteService.reativar(id);
        toast.sucesso("Cliente reativado.");
        await carregarClientes();
      } catch (erro) {
        toast.erro(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaClientes = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarClientes();
  }

  // ---------- Listeners ----------

  elementos.botaoIncluir.hidden = !podeEditar;
  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".confirmacao-overlay")) return;   // a janela de confirmação trata o próprio Esc
    if (elementos.modalEnderecoOverlay.classList.contains("aberto")) {
      fecharModalEndereco();   // abre por cima do modal do cliente: o Esc fecha só ele
      return;
    }
    fecharModal();
    fecharModalVisualizacao();
  });
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
  aplicarMascara(elementos.campoDocumento, mascararDocumento);
  aplicarMascara(campo("campo-telefone"), mascararTelefone);
  aplicarMascara(elementos.campoCep, mascararCep);
  aplicarMascara(campo("campo-ddd"), mascararNumeros);
  aplicarMascara(campo("end-cep"), mascararCep);
  aplicarMascara(campo("end-ddd"), mascararNumeros);
  elementos.campoCep.addEventListener("input", tratarBuscaCep);
  campo("botao-novo-endereco").addEventListener("click", () => abrirModalEndereco());
  campo("lista-entregas-form").addEventListener("click", tratarAcaoEntrega);
  elementos.formEndereco.addEventListener("submit", salvarEndereco);
  campo("end-cep").addEventListener("input", tratarBuscaCepEndereco);
  campo("modal-endereco-fechar").addEventListener("click", fecharModalEndereco);
  campo("modal-endereco-cancelar").addEventListener("click", fecharModalEndereco);
  elementos.modalEnderecoOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalEnderecoOverlay) fecharModalEndereco();
  });
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  await carregarClientes();
});
