// Lógica da tela de detalhe de Geladeira: exibe os dados do equipamento
// (somente leitura — edição é feita via modal na listagem) e gerencia
// o histórico de manutenção associado a ela.

let geladeiraAtual = null;
let manutencoesCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const params = new URLSearchParams(window.location.search);
  const geladeiraId = params.get("id");

  if (!geladeiraId) {
    window.location.href = "geladeiras.html";
    return;
  }

  const elementos = {
    titulo: document.getElementById("detalhe-titulo"),
    badgeStatus: document.getElementById("badge-status"),
    botaoVoltar: document.getElementById("botao-voltar"),
    botaoNovaManutencao: document.getElementById("botao-nova-manutencao"),
    tabelaManutencoesCorpo: document.getElementById("tabela-manutencoes-corpo"),
    estadoVazioManutencoes: document.getElementById("estado-vazio-manutencoes"),
    modalOverlay: document.getElementById("modal-manutencao"),
    modalFechar: document.getElementById("modal-manutencao-fechar"),
    modalCancelar: document.getElementById("modal-manutencao-cancelar"),
    form: document.getElementById("form-manutencao"),
    campoCusto: document.getElementById("campo-custo-manutencao")
  };

  aplicarMascaraMoeda(elementos.campoCusto);

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  function formatarMoeda(numero) {
    return `R$ ${Number(numero || 0).toFixed(2).replace(".", ",")}`;
  }

  function rotuloStatus(status) {
    const rotulos = { em_campo: "Em campo", manutencao: "Em manutenção", desativada: "Desativada" };
    return rotulos[status] ?? status;
  }

  function classeStatus(status) {
    if (status === "em_campo") return "confirmado";
    if (status === "desativada") return "cancelado";
    return "pendente";
  }

  async function carregarGeladeira() {
    geladeiraAtual = await geladeiraService.buscarPorId(geladeiraId);
    const cliente = await clienteService.buscarPorId(geladeiraAtual.cliente_id);

    elementos.titulo.textContent = geladeiraAtual.numero_serie
      ? `Geladeira ${geladeiraAtual.numero_serie}`
      : `Geladeira #${geladeiraAtual.id}`;

    elementos.badgeStatus.textContent = rotuloStatus(geladeiraAtual.status);
    elementos.badgeStatus.className = `badge-status-grande badge-status-grande--${classeStatus(geladeiraAtual.status)}`;
    elementos.badgeStatus.style.display = "inline-flex";

    document.getElementById("vis-cliente").textContent = cliente.nome;
    document.getElementById("vis-tipo").textContent = geladeiraAtual.tipo;
    document.getElementById("vis-marca-modelo").textContent =
      [geladeiraAtual.marca, geladeiraAtual.modelo].filter(Boolean).join(" / ") || "—";
    document.getElementById("vis-numero-serie").textContent = geladeiraAtual.numero_serie ?? "—";
    document.getElementById("vis-data-alocacao").textContent = formatarData(geladeiraAtual.data_alocacao);
  }

  async function carregarManutencoes() {
    manutencoesCache = await historicoManutencaoService.listar({ geladeiraId });
    renderizarManutencoes();
  }

  function renderizarManutencoes() {
    if (manutencoesCache.length === 0) {
      elementos.tabelaManutencoesCorpo.innerHTML = "";
      elementos.estadoVazioManutencoes.style.display = "block";
      return;
    }

    elementos.estadoVazioManutencoes.style.display = "none";

    elementos.tabelaManutencoesCorpo.innerHTML = manutencoesCache.map(m => `
      <tr>
        <td>${formatarData(m.data)}</td>
        <td>${m.tipo === "preventiva" ? "Preventiva" : "Corretiva"}</td>
        <td>${m.descricao ?? "—"}</td>
        <td>${formatarMoeda(m.custo)}</td>
        <td class="celula-acoes">
          <button class="botao-icone botao-icone--perigo" data-acao="excluir" data-id="${m.id}" title="Excluir" aria-label="Excluir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>
        </td>
      </tr>
    `).join("");
  }

  function abrirModal() {
    elementos.form.reset();
    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
  }

  async function salvarManutencao(evento) {
    evento.preventDefault();

    const dados = {
      geladeira_id: parseInt(geladeiraId, 10),
      tipo: document.getElementById("campo-tipo-manutencao").value,
      data: document.getElementById("campo-data-manutencao").value || null,
      descricao: document.getElementById("campo-descricao-manutencao").value || null,
      custo: moedaParaNumero(elementos.campoCusto.value) || 0
    };

    const botaoSalvar = document.getElementById("modal-manutencao-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      await historicoManutencaoService.criar(dados);
      fecharModal();
      await carregarManutencoes();
    } catch (erro) {
      alert(erro.message);
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar";
    }
  }

  elementos.tabelaManutencoesCorpo.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-acao='excluir']");
    if (!botao) return;

    if (!confirm("Excluir este registro de manutenção permanentemente?")) return;

    try {
      await historicoManutencaoService.excluir(botao.dataset.id);
      await carregarManutencoes();
    } catch (erro) {
      alert(erro.message);
    }
  });

  elementos.botaoVoltar.addEventListener("click", () => {
    window.location.href = "geladeiras.html";
  });

  elementos.botaoNovaManutencao.addEventListener("click", abrirModal);
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarManutencao);

  try {
    await carregarGeladeira();
    await carregarManutencoes();
  } catch (erro) {
    alert(erro.message);
    window.location.href = "geladeiras.html";
  }
});