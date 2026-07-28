// Lógica da tela de Usuários: CRUD completo, com duas regras de proteção
// específicas deste módulo: (1) senha é opcional na edição — só atualiza
// se preenchida; (2) um admin não pode desativar/rebaixar a própria conta
// pela UI, evitando que ele se tranque fora do sistema.

let usuariosCache = [];
let abaAtivaUsuario = "ativos";
let usuarioEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAdmin()) return;

  const usuarioLogado = getUsuarioAtual();

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-usuarios-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-usuario"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-usuario"),
    campoSenha: document.getElementById("campo-senha"),
    labelSenha: document.getElementById("label-senha"),
    ajudaSenha: document.getElementById("ajuda-senha"),
    campoAdmin: document.getElementById("campo-admin")
  };

  async function carregarUsuarios() {
    try {
      usuariosCache = abaAtivaUsuario === "ativos"
        ? await usuarioService.listar()
        : await usuarioService.listarInativos();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtrados = usuariosCache.filter(u => {
      if (!termoBusca) return true;
      return u.nome.toLowerCase().includes(termoBusca) || u.email.toLowerCase().includes(termoBusca);
    });

    if (filtrados.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtrados.map(usuario => {
      const ehVoceMesmo = String(usuario.id) === String(usuarioLogado?.id);
      const badgePermissao = usuario.admin
        ? '<span class="badge-permissao badge-permissao--admin">Administrador</span>'
        : '<span class="badge-permissao badge-permissao--comum">Comum</span>';
      const badgeStatusClasse = usuario.ativo ? "badge-status--ativo" : "badge-status--inativo";

      let botaoAcao;
      if (!usuario.ativo) {
        botaoAcao = `
          <button class="botao-icone" data-acao="reativar" data-id="${usuario.id}" title="Reativar" aria-label="Reativar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          </button>`;
      } else if (ehVoceMesmo) {
        botaoAcao = `
          <button class="botao-icone" disabled title="Você não pode desativar a própria conta" aria-label="Indisponível" style="opacity: 0.35; cursor: not-allowed;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>`;
      } else {
        botaoAcao = `
          <button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${usuario.id}" title="Desativar" aria-label="Desativar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>`;
      }

      return `
        <tr>
          <td class="celula-nome">${usuario.nome}${ehVoceMesmo ? ' <span style="color: var(--neutro-secundario); font-weight: 400;">(você)</span>' : ""}</td>
          <td>${usuario.email}</td>
          <td>${badgePermissao}</td>
          <td><span class="badge-status ${badgeStatusClasse}">${usuario.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="editar" data-id="${usuario.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(usuario = null) {
    elementos.form.reset();
    limparErrosForm();

    if (usuario) {
      usuarioEmEdicaoId = usuario.id;
      elementos.modalTitulo.textContent = "Editar usuário";
      document.getElementById("campo-nome").value = usuario.nome;
      document.getElementById("campo-email").value = usuario.email;
      elementos.campoAdmin.checked = usuario.admin;

      elementos.campoSenha.required = false;
      elementos.labelSenha.textContent = "Nova senha";
      elementos.ajudaSenha.style.display = "block";
    } else {
      usuarioEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo usuário";
      elementos.campoAdmin.checked = false;

      elementos.campoSenha.required = true;
      elementos.labelSenha.textContent = "Senha *";
      elementos.ajudaSenha.style.display = "none";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    usuarioEmEdicaoId = null;
  }

  function limparErrosForm() {
    document.querySelectorAll(".campo-form").forEach(campo => campo.classList.remove("invalido"));
  }

  function validarForm(nome, email, senha) {
    limparErrosForm();
    let valido = true;

    if (!nome.trim()) {
      document.getElementById("campo-nome").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!email.trim() || !email.includes("@")) {
      document.getElementById("campo-email").closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!usuarioEmEdicaoId && !senha) {
      elementos.campoSenha.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarUsuario(evento) {
    evento.preventDefault();

    const nome = document.getElementById("campo-nome").value;
    const email = document.getElementById("campo-email").value;
    const senha = elementos.campoSenha.value;
    const admin = elementos.campoAdmin.checked;

    if (!validarForm(nome, email, senha)) return;

    if (usuarioEmEdicaoId && String(usuarioEmEdicaoId) === String(usuarioLogado?.id) && !admin) {
      alert("Você não pode remover sua própria permissão de administrador.");
      return;
    }

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (usuarioEmEdicaoId) {
        const dados = { nome, email, admin };
        if (senha) dados.senha = senha;
        await usuarioService.atualizar(usuarioEmEdicaoId, dados);
      } else {
        await usuarioService.criar({ nome, email, senha, admin });
      }
      fecharModal();
      await carregarUsuarios();
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

    if (acao === "editar") {
      const usuario = usuariosCache.find(u => u.id === id);
      if (usuario) abrirModal(usuario);
    }

    if (acao === "desativar") {
      if (!confirm("Desativar este usuário? Ele perderá acesso ao sistema imediatamente.")) return;
      try {
        await usuarioService.desativar(id);
        await carregarUsuarios();
      } catch (erro) {
        alert(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await usuarioService.reativar(id);
        await carregarUsuarios();
      } catch (erro) {
        alert(erro.message);
      }
    }
  }

  function trocarAba(novaAba) {
    abaAtivaUsuario = novaAba;
    elementos.abaAtivos.classList.toggle("aba-status--ativa", novaAba === "ativos");
    elementos.abaInativos.classList.toggle("aba-status--ativa", novaAba === "inativos");
    carregarUsuarios();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarUsuario);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);

  await carregarUsuarios();
});