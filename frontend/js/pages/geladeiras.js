// Lógica da tela de listagem de Geladeiras: busca, filtro ativas/desativadas,
// cadastro via modal (sem ViaCEP — geladeira não tem endereço próprio).

let geladeirasCache = [];
let clientesMapGeladeira = {};
let abaAtivaGeladeira = "ativas";
let geladeiraEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-geladeiras-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivas: document.getElementById("aba-ativas"),
    abaDesativadas: document.getElementById("aba-desativadas"),
    botaoIncluir: document.getElementById("botao-incluir"),
    modalOverlay: document.getElementById("modal-geladeira"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-geladeira"),
    campoCliente: document.getElementById("campo-cliente")
  };

  function formatarData(isoString) {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleDateString("pt-BR");
  }

  function rotuloStatus(status) {
    const rotulos = { em_campo: "Em campo", manutencao: "Em manutenção", desativada: "Desativada" };
    return rotulos[status] ?? status;
  }

  function classeStatus(status) {
    if (status === "em_campo") return "badge-status--ativo";
    return "badge-status--inativo";
  }

  async function carregarClientesMap() {
    const clientes = await clienteService.listar({ incluirInativos: true });
    clientesMapGeladeira = clientes.reduce((mapa, c) => {
      mapa[c.id] = c.nome;
      return mapa;
    }, {});

    elementos.campoCliente.innerHTML = '<option value="">Selecione um cliente...</option>' +
      clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  }

  function nomeCliente(id) {
    return clientesMapGeladeira[id] ?? `Cliente #${id}`;
  }

  async function carregarGeladeiras() {
    try {
      geladeirasCache = abaAtivaGeladeira === "ativas"
        ? await geladeiraService.listar()
        : await geladeiraService.listarDesativadas();
      renderizarTabela();
    } catch (erro) {
      alert(erro.message);
    }
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();

    const filtradas = geladeirasCache.filter(g => {
      if (!termoBusca) return true;
      return (
        (g.numero_serie ?? "").toLowerCase().includes(termoBusca) ||
        (g.modelo ?? "").toLowerCase().includes(termoBusca) ||
        nomeCliente(g.cliente_id).toLowerCase().includes(termoBusca)
      );
    });

    if (filtradas.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = filtradas.map(geladeira => {
      const botaoAcao = geladeira.status === "desativada"
        ? `<button class="botao-icone" data-acao="reativar" data-id="${geladeira.id}" title="Reativar" aria-label="Reativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>`
        : `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${geladeira.id}" title="Desativar" aria-label="Desativar">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
           </button>`;

      return `
        <tr data-id="${geladeira.id}">
          <td class="celula-nome celula-link" data-id="${geladeira.id}">${geladeira.numero_serie ?? "—"}</td>
          <td class="celula-link" data-id="${geladeira.id}">${geladeira.tipo}${geladeira.modelo ? " · " + geladeira.modelo : ""}</td>
          <td class="celula-link" data-id="${geladeira.id}">${nomeCliente(geladeira.cliente_id)}</td>
          <td class="celula-link" data-id="${geladeira.id}">${formatarData(geladeira.data_alocacao)}</td>
          <td class="celula-link" data-id="${geladeira.id}"><span class="badge-status ${classeStatus(geladeira.status)}">${rotuloStatus(geladeira.status)}</span></td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="editar" data-id="${geladeira.id}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${botaoAcao}
          </td>
        </tr>
      `;
    }).join("");
  }

  function abrirModal(geladeira = null) {
    elementos.form.reset();

    if (geladeira) {
      geladeiraEmEdicaoId = geladeira.id;
      elementos.modalTitulo.textContent = "Editar geladeira";
      elementos.campoCliente.value = geladeira.cliente_id;
      document.getElementById("campo-tipo").value = geladeira.tipo;
      document.getElementById("campo-marca").value = geladeira.marca ?? "";
      document.getElementById("campo-modelo").value = geladeira.modelo ?? "";
      document.getElementById("campo-numero-serie").value = geladeira.numero_serie ?? "";
      document.getElementById("campo-data-alocacao").value = geladeira.data_alocacao
        ? geladeira.data_alocacao.slice(0, 10)
        : "";
    } else {
      geladeiraEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Nova geladeira";
    }

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    geladeiraEmEdicaoId = null;
  }

  async function salvarGeladeira(evento) {
    evento.preventDefault();

    const dados = {
      cliente_id: parseInt(elementos.campoCliente.value, 10),
      tipo: document.getElementById("campo-tipo").value,
      marca: document.getElementById("campo-marca").value || null,
      modelo: document.getElementById("campo-modelo").value || null,
      numero_serie: document.getElementById("campo-numero-serie").value || null,
      data_alocacao: document.getElementById("campo-data-alocacao").value || null
    };

    if (!dados.cliente_id || !dados.tipo) {
      alert("Selecione o cliente e o tipo da geladeira.");
      return;
    }

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      if (geladeiraEmEdicaoId) {
        await geladeiraService.atualizar(geladeiraEmEdicaoId, dados);
      } else {
        await geladeiraService.criar(dados);
      }
      fecharModal();
      await carregarGeladeiras();
    } catch (erro) {
      alert(erro.message);
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar";
    }
  }

  async function tratarAcaoTabela(evento) {
    const botao = evento.target.closest("button[data-acao]");

    if (botao) {
      const id = parseInt(botao.dataset.id, 10);
      const acao = botao.dataset.acao;

      if (acao === "editar") {
        const geladeira = geladeirasCache.find(g => g.id === id);
        if (geladeira) abrirModal(geladeira);
      }

      if (acao === "desativar") {
        if (!confirm("Desativar esta geladeira? O histórico de manutenção será preservado.")) return;
        try {
          await geladeiraService.desativar(id);
          await carregarGeladeiras();
        } catch (erro) {
          alert(erro.message);
        }
      }

      if (acao === "reativar") {
        try {
          await geladeiraService.reativar(id);
          await carregarGeladeiras();
        } catch (erro) {
          alert(erro.message);
        }
      }
      return;
    }

    const celulaLink = evento.target.closest(".celula-link");
    if (celulaLink) {
      window.location.href = `geladeira-detalhe.html?id=${celulaLink.dataset.id}`;
    }
  }

  function trocarAba(novaAba) {
    abaAtivaGeladeira = novaAba;
    elementos.abaAtivas.classList.toggle("aba-status--ativa", novaAba === "ativas");
    elementos.abaDesativadas.classList.toggle("aba-status--ativa", novaAba === "desativadas");
    carregarGeladeiras();
  }

  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarGeladeira);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivas.addEventListener("click", () => trocarAba("ativas"));
  elementos.abaDesativadas.addEventListener("click", () => trocarAba("desativadas"));
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);

  await carregarClientesMap();
  await carregarGeladeiras();
});