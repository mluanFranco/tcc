// Tela de Usuários (somente administrador).
//  - Lista com foto, grupo, perfil e status; abas Ativos/Inativos e busca.
//  - Modal: dados, senha, grupo de acesso, administrador, permissões extras (o que o grupo já libera aparece travado) e foto.
//  - A foto é salva na hora (endpoint próprio); o resto, ao clicar em Salvar.
// Dependências: auth.js, formatadores.js (escaparHtml), feedback.js (toast, confirmarAcao), permissoes-seletor.js.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAdmin()) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    corpo: $("tabela-usuarios-corpo"), vazio: $("estado-vazio"), carregando: $("estado-carregando"),
    busca: $("campo-busca"), abaAtivos: $("aba-ativos"), abaInativos: $("aba-inativos"), botaoIncluir: $("botao-incluir"),
    modal: $("modal-usuario"), titulo: $("modal-titulo"), fechar: $("modal-fechar"), cancelar: $("modal-cancelar"),
    salvar: $("modal-salvar"), form: $("form-usuario"),
    grupoNome: $("grupo-nome"), nome: $("campo-nome"), erroNome: $("erro-nome"),
    grupoEmail: $("grupo-email"), email: $("campo-email"), erroEmail: $("erro-email"),
    grupoSenha: $("grupo-senha"), senha: $("campo-senha"), erroSenha: $("erro-senha"), labelSenha: $("label-senha"), ajudaSenha: $("ajuda-senha"),
    grupoAcesso: $("campo-grupo"), admin: $("campo-admin"), ajudaAdmin: $("ajuda-admin"),
    blocoFoto: $("bloco-foto"), fotoPreview: $("foto-preview"), fotoTrocar: $("foto-trocar"), fotoRemover: $("foto-remover"), fotoArquivo: $("foto-arquivo"),
    permLista: $("perm-lista"), permContador: $("perm-contador"), limpar: $("perm-limpar"), avisoAdmin: $("aviso-admin"), dicaExtras: $("dica-extras"),
    resumo: $("resumo-acesso")
  };

  const seletor = permissoesSeletor.criar({
    lista: el.permLista,
    contador: el.permContador,
    textoContador: (sel, herdadas) => `${sel} ${sel === 1 ? "extra" : "extras"}${herdadas ? ` · ${herdadas} do grupo` : ""}`,
    aoMudar: () => atualizarResumo()
  });

  const meuId = String(getUsuarioAtual()?.id ?? "");
  const SENHA_MIN = 8;
  const SENHA_MAX_BYTES = 72;
  const FOTO_MAX_BYTES = 2 * 1024 * 1024;
  const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];

  let usuarios = [];
  let grupos = [];
  let abaAtual = "ativos";
  let requisicaoAtual = 0;
  let emEdicao = null;               // usuário sendo editado (null = novo)
  let extrasOriginais = [];
  let snapshotInicial = "";
  let enviando = false;
  let ocupado = false;
  let fotoOcupada = false;

  const ICONE_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const ICONE_DESATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  const ICONE_REATIVAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

  // ---------- Avatar (a foto exige o token, então vem como blob) ----------
  const cacheFotos = new Map();      // id -> object URL (ou null se não tem/falhou)

  function iniciais(nome) {
    const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    const a = partes[0][0];
    const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (a + b).toUpperCase();
  }

  async function urlDaFoto(usuario) {
    if (!usuario.foto_url) return null;
    if (cacheFotos.has(usuario.id)) return cacheFotos.get(usuario.id);
    try {
      const blob = await apiFetchBlob(usuario.foto_url);
      const url = URL.createObjectURL(blob);
      cacheFotos.set(usuario.id, url);
      return url;
    } catch (_) {
      cacheFotos.set(usuario.id, null);
      return null;
    }
  }

  function esquecerFoto(id) {
    const url = cacheFotos.get(id);
    if (url) URL.revokeObjectURL(url);
    cacheFotos.delete(id);
  }

  function aplicarFoto(elemento, url, classeFoto) {
    if (!elemento) return;
    if (url) {
      elemento.style.backgroundImage = `url("${url}")`;
      elemento.classList.add(classeFoto);
    } else {
      elemento.style.backgroundImage = "";
      elemento.classList.remove(classeFoto);
    }
  }

  async function carregarFotosDaLista() {
    const donos = [...el.corpo.querySelectorAll("[data-foto-id]")];
    for (const avatar of donos) {
      const usuario = usuarios.find(u => u.id === Number(avatar.dataset.fotoId));
      if (!usuario) continue;
      const url = await urlDaFoto(usuario);
      if (avatar.isConnected) aplicarFoto(avatar, url, "avatar-usuario--foto");
    }
  }

  // ---------- Lista ----------
  const nomeDoGrupo = (id) => grupos.find(g => g.id === id)?.nome || null;

  function mostrarVazio(texto) {
    el.corpo.innerHTML = "";
    el.vazio.textContent = texto;
    el.vazio.hidden = false;
  }

  function visiveis() {
    const termo = el.busca.value.trim().toLowerCase();
    return usuarios.filter(u => u.ativo === (abaAtual === "ativos") &&
      (!termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo) ||
        (nomeDoGrupo(u.grupo_id) || "").toLowerCase().includes(termo)));
  }

  function renderizar() {
    el.carregando.hidden = true;
    const lista = visiveis();
    if (lista.length === 0) {
      mostrarVazio(el.busca.value.trim() ? "Nenhum usuário encontrado com essa busca." : (abaAtual === "ativos" ? "Nenhum usuário ativo." : "Nenhum usuário inativo."));
      return;
    }
    el.vazio.hidden = true;
    el.corpo.innerHTML = lista.map(u => {
      const nome = escaparHtml(u.nome);
      const souEu = String(u.id) === meuId;
      const grupo = nomeDoGrupo(u.grupo_id);
      const acaoStatus = u.ativo
        ? (souEu
          ? `<button type="button" class="botao-icone botao-icone--perigo" disabled title="Você não pode desativar o seu próprio usuário" aria-label="Desativar usuário ${nome} (indisponível)">${ICONE_DESATIVAR}</button>`
          : `<button type="button" class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${u.id}" title="Desativar" aria-label="Desativar usuário ${nome}">${ICONE_DESATIVAR}</button>`)
        : `<button type="button" class="botao-icone" data-acao="reativar" data-id="${u.id}" title="Reativar" aria-label="Reativar usuário ${nome}">${ICONE_REATIVAR}</button>`;
      return `
        <tr>
          <td>
            <div class="celula-usuario">
              <span class="avatar-usuario" data-foto-id="${u.id}" aria-hidden="true">${escaparHtml(iniciais(u.nome))}</span>
              <span class="celula-usuario__nome">${nome}${souEu ? '<span class="marca-voce">Você</span>' : ""}</span>
            </div>
          </td>
          <td class="celula-email">${escaparHtml(u.email)}</td>
          <td>${grupo ? escaparHtml(grupo) : '<span class="celula-sem-grupo">Sem grupo</span>'}</td>
          <td><span class="badge-permissao ${u.admin ? "badge-permissao--admin" : "badge-permissao--comum"}">${u.admin ? "Administrador" : "Comum"}</span></td>
          <td><span class="badge-status ${u.ativo ? "badge-status--ativo" : "badge-status--inativo"}">${u.ativo ? "Ativo" : "Inativo"}</span></td>
          <td class="celula-acoes">
            <button type="button" class="botao-icone" data-acao="editar" data-id="${u.id}" title="Editar" aria-label="Editar usuário ${nome}">${ICONE_EDITAR}</button>
            ${acaoStatus}
          </td>
        </tr>`;
    }).join("");
    carregarFotosDaLista();
  }

  async function carregar() {
    const minha = ++requisicaoAtual;
    el.corpo.innerHTML = "";
    el.vazio.hidden = true;
    el.carregando.hidden = false;
    try {
      const [dadosUsuarios, dadosGrupos] = await Promise.all([
        usuarioService.listar({ incluirInativos: true }),
        grupoAcessoService.listar({ incluirInativos: true }).catch(() => grupos)
      ]);
      if (minha !== requisicaoAtual) return;
      usuarios = dadosUsuarios;
      grupos = dadosGrupos;
      renderizar();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      usuarios = [];
      el.carregando.hidden = true;
      mostrarVazio("Não foi possível carregar os usuários.");
      toast.erro(erro.message);
    }
  }

  function trocarAba(nova) {
    abaAtual = nova;
    el.abaAtivos.classList.toggle("aba-status--ativa", nova === "ativos");
    el.abaInativos.classList.toggle("aba-status--ativa", nova === "inativos");
    renderizar();
  }

  // ---------- Modal ----------
  const grupoSelecionado = () => grupos.find(g => g.id === Number(el.grupoAcesso.value)) || null;
  const instantaneo = () => JSON.stringify([el.nome.value.trim(), el.email.value.trim(), el.senha.value, el.grupoAcesso.value, el.admin.checked, seletor.obter()]);
  const alterado = () => instantaneo() !== snapshotInicial;

  function atualizarResumo() {
    if (el.admin.checked) {
      el.resumo.textContent = "Acesso efetivo: tudo (administrador).";
      return;
    }
    const uniao = [...new Set([...(grupoSelecionado()?.permissoes || []), ...seletor.obter()])];
    el.resumo.textContent = uniao.length === 0
      ? "Acesso efetivo: somente consulta dos cadastros."
      : `Acesso efetivo: cadastros (consulta) + ${resumoModulos(uniao).join(", ")}.`;
  }

  function atualizarVisaoAdmin() {
    const admin = el.admin.checked;
    el.permLista.hidden = admin;
    el.avisoAdmin.hidden = !admin;
    el.dicaExtras.hidden = admin;
    el.limpar.disabled = admin;
  }

  function atualizarHerdadas() {
    // Troca de grupo: o que era extra e agora o grupo já dá deixa de ser extra (some das marcadas do usuário).
    seletor.definir(seletor.obter(), grupoSelecionado()?.permissoes || []);
    atualizarResumo();
  }

  function montarOpcoesDeGrupo(grupoIdAtual) {
    const opcoes = ['<option value="">Sem grupo</option>'];
    grupos.filter(g => g.ativo || g.id === grupoIdAtual).forEach(g => {
      opcoes.push(`<option value="${g.id}">${escaparHtml(g.nome)}${g.ativo ? "" : " (inativo)"}</option>`);
    });
    el.grupoAcesso.innerHTML = opcoes.join("");
    el.grupoAcesso.value = grupoIdAtual ? String(grupoIdAtual) : "";
  }

  function limparErros() {
    [el.grupoNome, el.grupoEmail, el.grupoSenha].forEach(g => g.classList.remove("invalido"));
    el.erroNome.textContent = "";
    el.erroEmail.textContent = "";
    el.erroSenha.textContent = "";
  }
  function erroCampo(grupo, msgEl, campo, msg) { grupo.classList.add("invalido"); msgEl.textContent = msg; campo.focus(); }

  function definirEnviando(valor) {
    enviando = valor;
    el.salvar.disabled = valor;
    el.salvar.textContent = valor ? "Salvando..." : "Salvar";
  }

  async function mostrarFotoDoModal(usuario) {
    el.fotoPreview.textContent = iniciais(usuario.nome);
    aplicarFoto(el.fotoPreview, null, "usuario-foto__avatar--foto");
    el.fotoRemover.disabled = !usuario.foto_url;
    const url = await urlDaFoto(usuario);
    if (emEdicao && emEdicao.id === usuario.id) aplicarFoto(el.fotoPreview, url, "usuario-foto__avatar--foto");
  }

  async function abrirModal(usuario = null) {
    if (el.modal.classList.contains("aberto") || ocupado) return;
    if (!seletor.temCatalogo()) {
      try {
        seletor.definirCatalogo(await grupoAcessoService.listarPermissoes());
      } catch (erro) {
        toast.erro(`Não foi possível carregar as permissões. ${erro.message}`);
        return;
      }
    }

    let extras = [];
    if (usuario) {
      try {
        extras = (await usuarioService.buscarPermissoes(usuario.id)).extras || [];
      } catch (erro) {
        toast.erro(`Não foi possível carregar as permissões do usuário. ${erro.message}`);
        return;
      }
    }

    emEdicao = usuario;
    extrasOriginais = [...extras];
    limparErros();
    el.form.reset();
    const souEu = !!usuario && String(usuario.id) === meuId;

    el.titulo.textContent = usuario ? "Editar usuário" : "Novo usuário";
    el.nome.value = usuario ? usuario.nome : "";
    el.email.value = usuario ? usuario.email : "";
    el.labelSenha.textContent = usuario ? "Nova senha" : "Senha *";
    el.ajudaSenha.textContent = usuario ? "Deixe em branco para manter a senha atual. Se preencher, use de 8 a 72 caracteres." : "De 8 a 72 caracteres.";
    el.senha.placeholder = usuario ? "Manter a senha atual" : "";
    montarOpcoesDeGrupo(usuario ? usuario.grupo_id : null);
    el.admin.checked = !!usuario?.admin;
    el.admin.disabled = souEu;
    el.ajudaAdmin.textContent = souEu
      ? "Você não pode remover a sua própria permissão de administrador. Peça a outro administrador."
      : "Administradores têm acesso a todas as áreas, inclusive Dashboard, Usuários e Grupos de Acesso.";
    el.blocoFoto.hidden = !usuario;
    seletor.definir(extras, grupoSelecionado()?.permissoes || []);
    atualizarVisaoAdmin();
    atualizarResumo();
    if (usuario) mostrarFotoDoModal(usuario);

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
    if (enviando || fotoOcupada) return;
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

  function validar() {
    limparErros();
    const nome = el.nome.value.trim();
    const email = el.email.value.trim();
    const senha = el.senha.value;
    if (!nome) { erroCampo(el.grupoNome, el.erroNome, el.nome, "Informe o nome."); return false; }
    if (!email) { erroCampo(el.grupoEmail, el.erroEmail, el.email, "Informe o e-mail."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erroCampo(el.grupoEmail, el.erroEmail, el.email, "Informe um e-mail válido."); return false; }
    if (!emEdicao && !senha) { erroCampo(el.grupoSenha, el.erroSenha, el.senha, "Informe a senha."); return false; }
    if (senha) {
      if (senha.length < SENHA_MIN) { erroCampo(el.grupoSenha, el.erroSenha, el.senha, `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`); return false; }
      if (new TextEncoder().encode(senha).length > SENHA_MAX_BYTES) { erroCampo(el.grupoSenha, el.erroSenha, el.senha, "A senha é longa demais (máximo de 72 bytes)."); return false; }
    }
    return true;
  }

  function mostrarErroDoServidor(erro) {
    const msg = erro.message || "Erro ao salvar.";
    if (/e-?mail/i.test(msg)) erroCampo(el.grupoEmail, el.erroEmail, el.email, msg);
    else if (/senha/i.test(msg)) erroCampo(el.grupoSenha, el.erroSenha, el.senha, msg);
    else if (/nome/i.test(msg)) erroCampo(el.grupoNome, el.erroNome, el.nome, msg);
    else toast.erro(msg);
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (enviando || fotoOcupada) return;
    if (!validar()) return;

    const dados = {
      nome: el.nome.value.trim(),
      email: el.email.value.trim(),
      admin: el.admin.checked,
      grupo_id: el.grupoAcesso.value ? Number(el.grupoAcesso.value) : null
    };
    if (el.senha.value) dados.senha = el.senha.value;
    const extras = seletor.obter();

    definirEnviando(true);
    let salvo;
    try {
      salvo = emEdicao ? await usuarioService.atualizar(emEdicao.id, dados) : await usuarioService.criar(dados);
    } catch (erro) {
      definirEnviando(false);
      mostrarErroDoServidor(erro);
      return;
    }

    // Extras: administrador não usa (mantemos o que já existia); fora isso só grava se mudou.
    const id = salvo?.id ?? emEdicao?.id;
    const extrasMudaram = JSON.stringify(extras) !== JSON.stringify(extrasOriginais);
    let avisoExtras = false;
    if (!dados.admin && extrasMudaram && id != null) {
      try {
        await usuarioService.definirPermissoesExtras(id, extras);
      } catch (erro) {
        avisoExtras = erro.message;
      }
    }

    const edicao = !!emEdicao;
    fecharModal();
    definirEnviando(false);
    if (avisoExtras) toast.erro(`${edicao ? "Usuário atualizado" : "Usuário criado"}, mas as permissões extras não foram salvas: ${avisoExtras}. Abra o usuário e tente de novo.`);
    else toast.sucesso(edicao ? "Usuário atualizado." : "Usuário criado.");
    await carregar();
  }

  // ---------- Foto (salva na hora) ----------
  async function trocarFoto(arquivo) {
    if (!arquivo || !emEdicao || fotoOcupada) return;
    if (!FOTO_TIPOS.includes(arquivo.type)) { toast.erro("Use uma imagem JPEG, PNG ou WebP."); return; }
    if (arquivo.size > FOTO_MAX_BYTES) { toast.erro("A imagem é grande demais (máximo de 2 MB)."); return; }
    const alvo = emEdicao;
    fotoOcupada = true;
    el.fotoTrocar.disabled = el.fotoRemover.disabled = true;
    try {
      const resposta = await usuarioService.enviarFoto(alvo.id, arquivo);
      alvo.foto_url = resposta?.foto_url || `/usuarios/${alvo.id}/foto`;
      const naLista = usuarios.find(u => u.id === alvo.id);
      if (naLista) naLista.foto_url = alvo.foto_url;
      esquecerFoto(alvo.id);
      toast.sucesso("Foto atualizada.");
      if (emEdicao && emEdicao.id === alvo.id) await mostrarFotoDoModal(alvo);
      renderizar();
      if (String(alvo.id) === meuId) toast.info("A foto do menu lateral atualiza na próxima vez que você abrir uma tela.");
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      fotoOcupada = false;
      el.fotoTrocar.disabled = false;
      el.fotoRemover.disabled = !(emEdicao && emEdicao.foto_url);
      el.fotoArquivo.value = "";
    }
  }

  async function removerFoto() {
    if (!emEdicao || !emEdicao.foto_url || fotoOcupada) return;
    const alvo = emEdicao;
    fotoOcupada = true;
    el.fotoTrocar.disabled = el.fotoRemover.disabled = true;
    try {
      await usuarioService.removerFoto(alvo.id);
      alvo.foto_url = null;
      const naLista = usuarios.find(u => u.id === alvo.id);
      if (naLista) naLista.foto_url = null;
      esquecerFoto(alvo.id);
      toast.sucesso("Foto removida.");
      if (emEdicao && emEdicao.id === alvo.id) await mostrarFotoDoModal(alvo);
      renderizar();
    } catch (erro) {
      toast.erro(erro.message);
    } finally {
      fotoOcupada = false;
      el.fotoTrocar.disabled = false;
      el.fotoRemover.disabled = !(emEdicao && emEdicao.foto_url);
    }
  }

  // ---------- Eventos ----------
  [["nome", "grupoNome", "erroNome"], ["email", "grupoEmail", "erroEmail"], ["senha", "grupoSenha", "erroSenha"]].forEach(([campo, grupo, msg]) => {
    el[campo].addEventListener("input", () => { el[grupo].classList.remove("invalido"); el[msg].textContent = ""; });
  });
  el.grupoAcesso.addEventListener("change", atualizarHerdadas);
  el.admin.addEventListener("change", () => { atualizarVisaoAdmin(); atualizarResumo(); });
  el.limpar.addEventListener("click", () => seletor.limpar());
  el.fotoTrocar.addEventListener("click", () => el.fotoArquivo.click());
  el.fotoArquivo.addEventListener("change", () => trocarFoto(el.fotoArquivo.files[0]));
  el.fotoRemover.addEventListener("click", removerFoto);
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

  el.corpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao || ocupado) return;
    const usuario = usuarios.find(u => u.id === Number(botao.dataset.id));
    if (!usuario) return;
    const acao = botao.dataset.acao;

    if (acao === "editar") { abrirModal(usuario); return; }

    if (acao === "desativar") {
      const ok = await confirmarAcao({
        titulo: "Desativar usuário?",
        mensagem: `${usuario.nome} não conseguirá mais entrar no sistema. Você pode reativá-lo depois.`,
        textoConfirmar: "Desativar",
        perigo: true
      });
      if (!ok) return;
    }

    ocupado = true;
    try {
      if (acao === "desativar") await usuarioService.desativar(usuario.id);
      else await usuarioService.reativar(usuario.id);
      toast.sucesso(acao === "desativar" ? "Usuário desativado." : "Usuário reativado.");
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

  carregar();
});
