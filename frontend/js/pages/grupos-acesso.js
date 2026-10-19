// Grupos de Acesso (só administrador): lista, cadastro/edição com permissões por módulo, desativar e reativar.
//
// Regras que a tela espelha do backend:
//  - o nome é único (sem diferenciar maiúsculas), mesmo entre grupos inativos;
//  - "Criar e alterar" (editar) de um módulo já inclui "Visualizar" (ver): ao marcar editar, o ver fica marcado e travado;
//  - grupo com usuários ativos não pode ser desativado (o servidor confere; a tela avisa antes de tentar).
// O catálogo de permissões (módulos e ações) vem da API: a tela nunca fixa a lista de permissões.

const ROTULO_MODULO = {
  cadastros: "Cadastros", geladeiras: "Geladeiras", vendas: "Vendas", compras: "Compras", cotacoes: "Cotações",
  producao: "Produção", financeiro: "Financeiro", relatorios: "Relatórios", assistente: "Assistente de IA"
};
const ROTULO_ACAO = { ver: "Visualizar", editar: "Criar e alterar" };

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAdmin()) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    corpo: $("tabela-grupos-corpo"), vazio: $("estado-vazio"), carregando: $("estado-carregando"),
    busca: $("campo-busca"), abaAtivos: $("aba-ativos"), abaInativos: $("aba-inativos"), botaoIncluir: $("botao-incluir"),
    modal: $("modal-grupo"), titulo: $("modal-titulo"), fechar: $("modal-fechar"), cancelar: $("modal-cancelar"),
    salvar: $("modal-salvar"), form: $("form-grupo"),
    grupoNome: $("grupo-nome"), nome: $("campo-nome"), erroNome: $("erro-nome"),
    grupoDescricao: $("grupo-descricao"), descricao: $("campo-descricao"), erroDescricao: $("erro-descricao"),
    permLista: $("perm-lista"), permContador: $("perm-contador"), marcarTudo: $("perm-marcar-tudo"), limpar: $("perm-limpar")
  };

  let grupos = [];
  let catalogo = [];                 // [{ modulo, descricao, permissoes: [{ codigo, acao }] }]
  let abaAtual = "ativos";
  let requisicaoAtual = 0;
  let emEdicao = null;               // grupo sendo editado (null = novo)
  let selecionadas = new Set();      // códigos marcados no modal
  let snapshotInicial = "";
  let enviando = false;
  let ocupado = false;

  const rotuloModulo = (m) => ROTULO_MODULO[m] || (m.charAt(0).toUpperCase() + m.slice(1));
  const todosOsCodigos = () => catalogo.flatMap(m => m.permissoes.map(p => p.codigo));

  const ICONE_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const ICONE_DESATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  const ICONE_REATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

  // ---------- Lista ----------
  function resumoPermissoes(g) {
    const codigos = g.permissoes || [];
    if (codigos.length === 0) return '<span class="badge-permissoes-nenhuma">Nenhuma permissão</span>';
    const total = todosOsCodigos().length;
    if (total && codigos.length === total) return '<span class="badge-permissoes-todas">Acesso total</span>';
    const porModulo = new Map();
    codigos.forEach(c => {
      const [modulo, acao] = c.split(".");
      porModulo.set(modulo, (porModulo.get(modulo) || new Set()).add(acao));
    });
    const nomes = [...porModulo.entries()].map(([m, acoes]) => rotuloModulo(m) + (acoes.has("editar") || !acoes.has("ver") ? "" : " (leitura)"));
    const mostrados = nomes.slice(0, 3).join(", ");
    const resto = nomes.length > 3 ? ` +${nomes.length - 3}` : "";
    return `<span class="celula-dupla__principal">${codigos.length} ${codigos.length === 1 ? "permissão" : "permissões"}</span><span class="celula-dupla__sub" title="${escaparHtml(nomes.join(", "))}">${escaparHtml(mostrados + resto)}</span>`;
  }

  function mostrarVazio(texto) {
    el.corpo.innerHTML = "";
    el.vazio.textContent = texto;
    el.vazio.hidden = false;
  }

  function visiveis() {
    const termo = el.busca.value.trim().toLowerCase();
    return grupos.filter(g => g.ativo === (abaAtual === "ativos") &&
      (!termo || g.nome.toLowerCase().includes(termo) || (g.descricao || "").toLowerCase().includes(termo)));
  }

  function renderizar() {
    el.carregando.hidden = true;
    const lista = visiveis();
    if (lista.length === 0) {
      mostrarVazio(el.busca.value.trim() ? "Nenhum grupo encontrado com essa busca." : (abaAtual === "ativos" ? "Nenhum grupo ativo." : "Nenhum grupo inativo."));
      return;
    }
    el.vazio.hidden = true;
    el.corpo.innerHTML = lista.map(g => {
      const nome = escaparHtml(g.nome);
      const acaoStatus = g.ativo
        ? `<button type="button" class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${g.id}" title="Desativar" aria-label="Desativar grupo ${nome}">${ICONE_DESATIVAR}</button>`
        : `<button type="button" class="botao-icone" data-acao="reativar" data-id="${g.id}" title="Reativar" aria-label="Reativar grupo ${nome}">${ICONE_REATIVAR}</button>`;
      return `
        <tr>
          <td><span class="celula-dupla__principal">${nome}</span>${g.descricao ? `<span class="celula-dupla__sub">${escaparHtml(g.descricao)}</span>` : ""}</td>
          <td>${resumoPermissoes(g)}</td>
          <td class="celula-numero">${g.total_usuarios}</td>
          <td><span class="badge-status ${g.ativo ? "badge-status--ativo" : "badge-status--inativo"}">${g.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button type="button" class="botao-icone" data-acao="editar" data-id="${g.id}" title="Editar" aria-label="Editar grupo ${nome}">${ICONE_EDITAR}</button>
            ${acaoStatus}
          </td>
        </tr>`;
    }).join("");
  }

  async function carregar() {
    const minha = ++requisicaoAtual;
    el.corpo.innerHTML = "";
    el.vazio.hidden = true;
    el.carregando.hidden = false;
    try {
      const dados = await grupoAcessoService.listar({ incluirInativos: true });
      if (minha !== requisicaoAtual) return;
      grupos = dados;
      renderizar();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      grupos = [];
      el.carregando.hidden = true;
      mostrarVazio("Não foi possível carregar os grupos de acesso.");
      toast.erro(erro.message);
    }
  }

  function trocarAba(nova) {
    abaAtual = nova;
    el.abaAtivos.classList.toggle("aba-status--ativa", nova === "ativos");
    el.abaInativos.classList.toggle("aba-status--ativa", nova === "inativos");
    renderizar();
  }

  // ---------- Seletor de permissões ----------
  function renderizarPermissoes() {
    el.permLista.innerHTML = catalogo.map(m => {
      const temEditar = m.permissoes.some(p => p.acao === "editar");
      const opcoes = m.permissoes.map(p => {
        const travada = p.acao === "ver" && temEditar && selecionadas.has(`${m.modulo}.editar`);
        return `<label class="perm-opcao${travada ? " perm-opcao--travada" : ""}">
            <input type="checkbox" data-codigo="${escaparHtml(p.codigo)}" ${selecionadas.has(p.codigo) ? "checked" : ""} ${travada ? "disabled" : ""}>
            <span>${escaparHtml(ROTULO_ACAO[p.acao] || p.acao)}</span>
          </label>`;
      }).join("");
      return `<div class="perm-modulo">
          <div><span class="perm-modulo__nome">${escaparHtml(rotuloModulo(m.modulo))}</span><span class="perm-modulo__desc">${escaparHtml(m.descricao)}</span></div>
          <div class="perm-modulo__opcoes">${opcoes}</div>
        </div>`;
    }).join("");
    atualizarContador();
  }

  function atualizarContador() {
    const total = todosOsCodigos().length;
    el.permContador.textContent = `${selecionadas.size} de ${total} selecionadas`;
  }

  el.permLista.addEventListener("change", (evento) => {
    const caixa = evento.target.closest("input[data-codigo]");
    if (!caixa) return;
    const codigo = caixa.dataset.codigo;
    const [modulo, acao] = codigo.split(".");
    if (caixa.checked) {
      selecionadas.add(codigo);
      if (acao === "editar" && catalogo.find(m => m.modulo === modulo)?.permissoes.some(p => p.codigo === `${modulo}.ver`)) selecionadas.add(`${modulo}.ver`);
    } else {
      selecionadas.delete(codigo);
    }
    renderizarPermissoes();
  });

  el.marcarTudo.addEventListener("click", () => { selecionadas = new Set(todosOsCodigos()); renderizarPermissoes(); });
  el.limpar.addEventListener("click", () => { selecionadas = new Set(); renderizarPermissoes(); });

  // ---------- Modal ----------
  const selecionadasOrdenadas = () => todosOsCodigos().filter(c => selecionadas.has(c));
  const instantaneo = () => JSON.stringify([el.nome.value.trim(), el.descricao.value.trim(), selecionadasOrdenadas()]);
  const alterado = () => instantaneo() !== snapshotInicial;

  function limparErros() {
    [el.grupoNome, el.grupoDescricao].forEach(g => g.classList.remove("invalido"));
    el.erroNome.textContent = "";
    el.erroDescricao.textContent = "";
  }
  function erroNome(msg) { el.grupoNome.classList.add("invalido"); el.erroNome.textContent = msg; }

  function definirEnviando(valor) {
    enviando = valor;
    el.salvar.disabled = valor;
    el.salvar.textContent = valor ? "Salvando..." : "Salvar";
  }

  async function abrirModal(grupo = null) {
    if (el.modal.classList.contains("aberto") || ocupado) return;
    if (catalogo.length === 0) {
      try {
        catalogo = await grupoAcessoService.listarPermissoes();
      } catch (erro) {
        toast.erro(`Não foi possível carregar as permissões. ${erro.message}`);
        return;
      }
    }
    emEdicao = grupo;
    limparErros();
    el.form.reset();
    el.titulo.textContent = grupo ? "Editar grupo de acesso" : "Novo grupo de acesso";
    el.nome.value = grupo ? grupo.nome : "";
    el.descricao.value = grupo?.descricao || "";
    selecionadas = new Set(grupo ? grupo.permissoes : []);
    renderizarPermissoes();
    definirEnviando(false);
    snapshotInicial = instantaneo();
    el.modal.classList.add("aberto");
    el.nome.focus();
  }

  function fecharModal() {
    el.modal.classList.remove("aberto");
    emEdicao = null;
  }

  async function pedirParaFechar() {
    if (enviando) return;
    if (alterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi preenchido ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    fecharModal();
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (enviando) return;
    limparErros();
    const nome = el.nome.value.trim();
    if (!nome) { erroNome("Informe o nome do grupo."); el.nome.focus(); return; }

    const permissoes = selecionadasOrdenadas();
    if (emEdicao && emEdicao.total_usuarios > 0) {
      const antes = JSON.stringify(emEdicao.permissoes || []);
      if (antes !== JSON.stringify(permissoes)) {
        const n = emEdicao.total_usuarios;
        const ok = await confirmarAcao({
          titulo: "Alterar as permissões do grupo?",
          mensagem: `${n} ${n === 1 ? "usuário ativo está" : "usuários ativos estão"} neste grupo. O acesso ${n === 1 ? "dele muda" : "deles muda"} assim que você salvar.`,
          textoConfirmar: "Salvar alterações"
        });
        if (!ok) return;
      }
    }

    const dados = { nome, descricao: el.descricao.value.trim() || null, permissoes };
    definirEnviando(true);
    try {
      if (emEdicao) await grupoAcessoService.atualizar(emEdicao.id, dados);
      else await grupoAcessoService.criar(dados);
      const edicao = !!emEdicao;
      fecharModal();
      definirEnviando(false);
      toast.sucesso(edicao ? "Grupo atualizado." : "Grupo criado.");
      await carregar();
    } catch (erro) {
      definirEnviando(false);
      if (/nome/i.test(erro.message)) { erroNome(erro.message); el.nome.focus(); }
      else toast.erro(erro.message);
    }
  }

  el.nome.addEventListener("input", () => { el.grupoNome.classList.remove("invalido"); el.erroNome.textContent = ""; });
  el.form.addEventListener("submit", salvar);
  el.fechar.addEventListener("click", pedirParaFechar);
  el.cancelar.addEventListener("click", pedirParaFechar);
  el.modal.addEventListener("mousedown", (e) => { if (e.target === el.modal) pedirParaFechar(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.modal.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) pedirParaFechar();
  });
  window.addEventListener("beforeunload", (e) => {
    if (el.modal.classList.contains("aberto") && alterado()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------- Ações da lista ----------
  el.corpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao || ocupado) return;
    const grupo = grupos.find(g => g.id === Number(botao.dataset.id));
    if (!grupo) return;
    const acao = botao.dataset.acao;

    if (acao === "editar") { abrirModal(grupo); return; }

    if (acao === "desativar") {
      if (grupo.total_usuarios > 0) {
        const n = grupo.total_usuarios;
        toast.erro(`O grupo "${grupo.nome}" tem ${n} ${n === 1 ? "usuário ativo" : "usuários ativos"}. Mude-${n === 1 ? "o" : "os"} de grupo antes de desativar.`);
        return;
      }
      const ok = await confirmarAcao({
        titulo: "Desativar grupo?",
        mensagem: `O grupo "${grupo.nome}" deixa de poder ser escolhido para novos usuários. Você pode reativá-lo depois.`,
        textoConfirmar: "Desativar",
        perigo: true
      });
      if (!ok) return;
    }

    ocupado = true;
    try {
      if (acao === "desativar") await grupoAcessoService.desativar(grupo.id);
      else await grupoAcessoService.reativar(grupo.id);
      toast.sucesso(acao === "desativar" ? "Grupo desativado." : "Grupo reativado.");
      await carregar();
    } catch (erro) {
      toast.erro(erro.message);
      await carregar();
    } finally {
      ocupado = false;
    }
  });

  el.botaoIncluir.addEventListener("click", () => abrirModal(null));
  el.busca.addEventListener("input", renderizar);
  el.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  el.abaInativos.addEventListener("click", () => trocarAba("inativos"));

  // Catálogo em segundo plano: só o resumo da lista ("Acesso total") depende dele.
  grupoAcessoService.listarPermissoes().then(c => { catalogo = c; if (grupos.length) renderizar(); }).catch(() => { /* o modal tenta de novo ao abrir */ });
  carregar();
});
