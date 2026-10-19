// Assistente de IA: chat com conversas salvas. A IA responde em texto, pode anexar uma tabela com o resultado da
// consulta e sempre informa o SQL usado ("Ver consulta usada"). O que ela enxerga é limitado pelas permissões do usuário
// no backend; a tela só mostra o que a API devolve.
//
// Pontos de atenção:
//  - a resposta pode demorar vários segundos: o envio fica travado e aparece "Consultando os dados...";
//  - todo texto vindo da API é escapado antes de virar HTML (o "markdown" aceito é só parágrafo, negrito, código e listas);
//  - 429 (limite por hora) e erros da IA viram uma mensagem no próprio chat; só os erros temporários têm "Tentar de novo".

const SUGESTOES = [
  "Quais produtos estão com estoque baixo?",
  "Quanto vendi neste mês?",
  "Quais contas a pagar vencem nos próximos 7 dias?",
  "Quais são os 5 clientes que mais compraram?"
];
const MAX_TEXTO = 2000;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("assistente.ver")) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    restantes: $("chat-restantes"), aviso: $("chat-aviso"),
    painelConversas: $("chat-conversas"), lista: $("lista-conversas"), vazioConversas: $("conversas-vazio"),
    botaoNova: $("botao-nova-conversa"), abrirConversas: $("botao-abrir-conversas"), fecharConversas: $("botao-fechar-conversas"),
    mensagens: $("chat-mensagens"), form: $("form-pergunta"), campo: $("campo-pergunta"), enviar: $("botao-enviar"), contador: $("contador-pergunta")
  };

  let status = null;
  let conversas = [];
  let conversaAtualId = null;
  let enviando = false;
  let carregandoConversa = 0;      // descarta resposta antiga se o usuário trocar de conversa rápido

  // ---------- Texto seguro ----------
  function inline(textoEscapado) {
    return textoEscapado
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  // Parágrafos, listas (- ou 1.), **negrito** e `código`. Tudo é escapado ANTES de qualquer marcação.
  function textoParaHtml(texto) {
    const linhas = String(texto ?? "").replace(/\r/g, "").split("\n");
    const blocos = [];
    let lista = null;
    let paragrafo = [];
    const fecharParagrafo = () => { if (paragrafo.length) { blocos.push(`<p>${paragrafo.join("<br>")}</p>`); paragrafo = []; } };
    const fecharLista = () => { if (lista) { blocos.push(`<${lista.tag}>${lista.itens.map(i => `<li>${i}</li>`).join("")}</${lista.tag}>`); lista = null; } };
    for (const bruta of linhas) {
      const linha = escaparHtml(bruta.trim());
      const marcador = /^(?:[-*•]\s+)(.+)$/.exec(linha);
      const numerado = /^\d+[.)]\s+(.+)$/.exec(linha);
      if (!linha) { fecharParagrafo(); fecharLista(); continue; }
      if (marcador || numerado) {
        fecharParagrafo();
        const tag = marcador ? "ul" : "ol";
        if (!lista || lista.tag !== tag) { fecharLista(); lista = { tag, itens: [] }; }
        lista.itens.push(inline((marcador || numerado)[1]));
      } else {
        fecharLista();
        paragrafo.push(inline(linha));
      }
    }
    fecharParagrafo();
    fecharLista();
    return blocos.join("") || "<p>—</p>";
  }

  // ---------- Tabela do resultado ----------
  const ehNumeroDecimalEmTexto = (v) => typeof v === "string" && /^-?\d{1,15}\.\d{1,4}$/.test(v);
  const ehDataIso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/.test(v);

  function celula(valor) {
    if (valor === null || valor === undefined || valor === "") return { texto: "—", numero: false };
    if (typeof valor === "boolean") return { texto: valor ? "Sim" : "Não", numero: false };
    if (typeof valor === "number" || ehNumeroDecimalEmTexto(valor)) {
      return { texto: Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(Number(valor)) ? 0 : 2, maximumFractionDigits: 4 }), numero: true };
    }
    if (ehDataIso(valor)) {
      return { texto: /[T ]\d{2}:\d{2}/.test(valor) && !/[T ]00:00(:00)?(\.0+)?$/.test(valor) ? formatarDataHora(valor.replace(" ", "T")) : formatarData(valor.slice(0, 10)), numero: false };
    }
    if (typeof valor === "object") return { texto: JSON.stringify(valor), numero: false };
    return { texto: String(valor), numero: false };
  }

  function tabelaHtml(tabela) {
    if (!tabela || !Array.isArray(tabela.colunas) || !tabela.colunas.length) return "";
    const linhas = Array.isArray(tabela.linhas) ? tabela.linhas : [];
    if (!linhas.length) return '<p class="chat-tabela-nota">A consulta não retornou linhas.</p>';
    const cabecalho = tabela.colunas.map(c => `<th scope="col">${escaparHtml(c)}</th>`).join("");
    const corpo = linhas.map(l => `<tr>${tabela.colunas.map((_, i) => {
      const c = celula(l[i]);
      return `<td${c.numero ? ' class="num"' : ""}>${escaparHtml(c.texto)}</td>`;
    }).join("")}</tr>`).join("");
    const nota = tabela.truncado ? `<p class="chat-tabela-nota">Mostrando só as primeiras ${linhas.length} linhas do resultado.</p>` : "";
    return `<div class="chat-tabela-wrap" tabindex="0"><table class="chat-tabela"><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table></div>${nota}`;
  }

  function sqlHtml(consultas) {
    if (!Array.isArray(consultas) || !consultas.length) return "";
    const blocos = consultas.map(c => `<pre>${escaparHtml(c)}</pre>`).join("");
    return `<details class="chat-sql"><summary>Ver consulta usada</summary>${blocos}</details>`;
  }

  // ---------- Mensagens ----------
  function rolarParaFim() { el.mensagens.scrollTop = el.mensagens.scrollHeight; }

  function limparMensagens() { el.mensagens.innerHTML = ""; }

  function adicionarUsuario(texto) {
    const d = document.createElement("div");
    d.className = "balao balao--usuario";
    d.textContent = texto;
    el.mensagens.appendChild(d);
    rolarParaFim();
    return d;
  }

  function adicionarAssistente({ texto, tabela, consultas }) {
    const d = document.createElement("div");
    d.className = "balao balao--assistente";
    d.innerHTML = textoParaHtml(texto) + tabelaHtml(tabela) + sqlHtml(consultas);
    el.mensagens.appendChild(d);
    rolarParaFim();
    return d;
  }

  function adicionarDigitando() {
    const d = document.createElement("div");
    d.className = "balao balao--assistente";
    d.setAttribute("data-digitando", "");
    d.innerHTML = '<span class="balao-digitando"><span class="balao-digitando__pontos" aria-hidden="true"><i></i><i></i><i></i></span><span>Consultando os dados...</span></span>';
    el.mensagens.appendChild(d);
    rolarParaFim();
    return d;
  }

  function adicionarErro(mensagem, aoTentarDeNovo) {
    const d = document.createElement("div");
    d.className = "balao balao--erro";
    d.setAttribute("role", "alert");
    const p = document.createElement("div");
    p.textContent = mensagem;
    d.appendChild(p);
    if (aoTentarDeNovo) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "botao-secundario";
      b.textContent = "Tentar de novo";
      b.addEventListener("click", () => { d.remove(); aoTentarDeNovo(); });
      d.appendChild(b);
    }
    el.mensagens.appendChild(d);
    rolarParaFim();
  }

  function mostrarVazio() {
    limparMensagens();
    const d = document.createElement("div");
    d.className = "chat-vazio";
    d.innerHTML = `<h2>Como posso ajudar?</h2>
      <p>Pergunte em linguagem natural sobre estoque, vendas, compras, produção, geladeiras e financeiro. Eu só enxergo o que o seu usuário tem permissão para ver, e mostro a consulta que usei.</p>
      <div class="chat-sugestoes">${SUGESTOES.map(s => `<button type="button" class="chat-sugestao">${escaparHtml(s)}</button>`).join("")}</div>`;
    el.mensagens.appendChild(d);
    atualizarEstadoEnvio();
  }

  el.mensagens.addEventListener("click", (e) => {
    const sug = e.target.closest(".chat-sugestao");
    if (sug && !sug.disabled) enviarPergunta(sug.textContent);
  });

  // ---------- Status, limite e campo de envio ----------
  function podeEnviar() {
    return !!status && status.habilitado && status.restantes_na_hora > 0 && !enviando;
  }

  function atualizarEstadoEnvio() {
    const ok = podeEnviar();
    el.campo.disabled = !status || !status.habilitado || status.restantes_na_hora <= 0 || enviando;
    el.enviar.disabled = !ok || el.campo.value.trim() === "";
    el.mensagens.querySelectorAll(".chat-sugestao").forEach(b => { b.disabled = !ok; });
  }

  function atualizarStatusVisual() {
    if (!status) { el.restantes.hidden = true; return; }
    const r = status.restantes_na_hora, total = status.limite_por_hora;
    el.restantes.hidden = !status.habilitado;
    el.restantes.textContent = `${r} de ${total} perguntas nesta hora`;
    el.restantes.classList.toggle("chat-restantes--pouco", r > 0 && r <= Math.max(1, Math.floor(total * 0.2)));
    el.restantes.classList.toggle("chat-restantes--zero", r <= 0);

    const avisos = [];
    if (!status.habilitado) avisos.push("O assistente de IA não está configurado neste servidor (falta a chave GEMINI_API_KEY no .env do backend).");
    else if (status.restantes_na_hora <= 0) avisos.push("Você usou todas as perguntas desta hora. Tente de novo mais tarde.");
    if (status.habilitado && status.modo_privado) avisos.push("Modo privado: os dados retornados pelas consultas não são enviados ao provedor de IA.");
    el.aviso.hidden = avisos.length === 0;
    el.aviso.classList.toggle("chat-aviso--info", status.habilitado && status.restantes_na_hora > 0);
    el.aviso.textContent = avisos.join(" ");
    atualizarEstadoEnvio();
  }

  async function carregarStatus() {
    try {
      status = await assistenteService.status();
    } catch (erro) {
      status = null;
      el.aviso.hidden = false;
      el.aviso.classList.remove("chat-aviso--info");
      el.aviso.textContent = `Não foi possível consultar o estado do assistente. ${erro.message}`;
    }
    atualizarStatusVisual();
  }

  function ajustarAlturaCampo() {
    el.campo.style.height = "auto";
    el.campo.style.height = Math.min(el.campo.scrollHeight, 140) + "px";
    const n = el.campo.value.length;
    el.contador.textContent = `${n}/${MAX_TEXTO}`;
    el.contador.classList.toggle("perto-limite", n >= MAX_TEXTO * 0.9);
  }

  el.campo.addEventListener("input", () => { ajustarAlturaCampo(); atualizarEstadoEnvio(); });
  el.campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!el.enviar.disabled) el.form.requestSubmit();
    }
  });
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = el.campo.value.trim();
    if (texto && podeEnviar()) enviarPergunta(texto);
  });

  // ---------- Envio ----------
  async function enviarPergunta(texto, { reenvio = false } = {}) {
    texto = String(texto).trim();
    if (!texto || !podeEnviar()) return;
    if (el.mensagens.querySelector(".chat-vazio")) limparMensagens();
    enviando = true;
    if (!reenvio) { adicionarUsuario(texto); el.campo.value = ""; ajustarAlturaCampo(); }
    atualizarEstadoEnvio();
    const digitando = adicionarDigitando();
    const conversaDaPergunta = conversaAtualId;
    let falhou = false;
    try {
      const r = await assistenteService.perguntar({ texto, conversaId: conversaDaPergunta });
      digitando.remove();
      if (conversaAtualId === conversaDaPergunta) {      // o usuário não trocou de conversa enquanto esperava
        conversaAtualId = r.conversa_id;
        adicionarAssistente({ texto: r.resposta, tabela: r.tabela, consultas: r.consultas });
      }
      if (status) status.restantes_na_hora = r.restantes_na_hora;
      await carregarConversas();
    } catch (erro) {
      digitando.remove();
      falhou = true;
      if (erro.status === 401) return;                   // sessão expirada: o api.js já redireciona
      if (erro.status === 404 && conversaDaPergunta) {
        toast.erro("Essa conversa não existe mais. Comece uma nova.");
        iniciarNovaConversa();
      } else if (erro.status === 429) {
        adicionarErro(erro.message);
      } else {
        const temporario = !erro.status || erro.status === 503;      // 503/rede: vale tentar de novo; os demais não mudam sozinhos
        adicionarErro(erro.message, temporario ? () => enviarPergunta(texto, { reenvio: true }) : null);
      }
    } finally {
      enviando = false;
      if (!falhou) atualizarStatusVisual();
      else await carregarStatus();      // a pergunta que falhou também conta no limite: confere o saldo no servidor
      if (!el.campo.disabled) el.campo.focus();
    }
  }

  // ---------- Conversas ----------
  function dataRelativa(iso) {
    const d = new Date(String(iso));
    if (isNaN(d)) return "";
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("pt-BR");
  }

  function renderizarConversas() {
    el.vazioConversas.hidden = conversas.length > 0;
    el.lista.innerHTML = conversas.map(c => `
      <li class="chat-conversa${c.id === conversaAtualId ? " chat-conversa--ativa" : ""}">
        <button type="button" class="chat-conversa__abrir" data-acao="abrir" data-id="${c.id}"${c.id === conversaAtualId ? ' aria-current="true"' : ""}>
          <span class="chat-conversa__titulo">${escaparHtml(c.titulo)}</span>
          <span class="chat-conversa__data">${escaparHtml(dataRelativa(c.updated_at))}</span>
        </button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" data-id="${c.id}" title="Excluir conversa" aria-label="Excluir conversa ${escaparHtml(c.titulo)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
        </button>
      </li>`).join("");
  }

  async function carregarConversas() {
    try {
      conversas = await assistenteService.listarConversas();
    } catch (erro) {
      toast.erro(`Não foi possível carregar as conversas. ${erro.message}`);
      conversas = [];
    }
    renderizarConversas();
  }

  function fecharPainelMobile() { el.painelConversas.classList.remove("chat-conversas--aberta"); }

  function iniciarNovaConversa() {
    carregandoConversa++;
    conversaAtualId = null;
    renderizarConversas();
    mostrarVazio();
    fecharPainelMobile();
    if (!el.campo.disabled) el.campo.focus();
  }

  async function abrirConversa(id) {
    if (enviando || id === conversaAtualId) { fecharPainelMobile(); return; }
    const minha = ++carregandoConversa;
    try {
      const c = await assistenteService.buscarConversa(id);
      if (minha !== carregandoConversa) return;
      conversaAtualId = c.id;
      limparMensagens();
      c.mensagens.forEach(m => {
        if (m.papel === "usuario") adicionarUsuario(m.conteudo);
        else adicionarAssistente({ texto: m.conteudo, tabela: m.tabela, consultas: m.consultas });
      });
      renderizarConversas();
      fecharPainelMobile();
      rolarParaFim();
    } catch (erro) {
      if (minha !== carregandoConversa) return;
      toast.erro(erro.status === 404 ? "Essa conversa não existe mais." : erro.message);
      await carregarConversas();
    }
  }

  async function excluirConversa(id) {
    const conversa = conversas.find(c => c.id === id);
    if (!conversa) return;
    const ok = await confirmarAcao({
      titulo: "Excluir conversa?",
      mensagem: `A conversa "${conversa.titulo}" sai da sua lista. Não dá para recuperá-la depois.`,
      textoConfirmar: "Excluir",
      perigo: true
    });
    if (!ok) return;
    try {
      await assistenteService.excluirConversa(id);
      toast.sucesso("Conversa excluída.");
      if (id === conversaAtualId) iniciarNovaConversa();
      await carregarConversas();
    } catch (erro) {
      toast.erro(erro.message);
      await carregarConversas();
    }
  }

  el.lista.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === "abrir") abrirConversa(id);
    else excluirConversa(id);
  });
  el.botaoNova.addEventListener("click", () => { if (!enviando) iniciarNovaConversa(); });
  el.abrirConversas.addEventListener("click", () => el.painelConversas.classList.add("chat-conversas--aberta"));
  el.fecharConversas.addEventListener("click", fecharPainelMobile);

  // ---------- Início ----------
  mostrarVazio();
  ajustarAlturaCampo();
  await Promise.all([carregarStatus(), carregarConversas()]);
});
