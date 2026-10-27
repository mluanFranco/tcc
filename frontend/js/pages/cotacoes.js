// Lista de Cotações (compra e venda) e Comparativo de Preços.
// Criar é em cotacao-nova.html; ver, editar e mudar o status é em cotacao-detalhe.html.
// O backend filtra por tipo e status; busca por nome/número e período são feitos aqui, na lista carregada.

let cotacoesCache = [];
let nomesFornecedor = {};   // { id: nome }
let nomesCliente = {};
let filtroStatusAtivo = "todos";
let requisicaoAtual = 0;    // descarta respostas antigas se o usuário trocar de filtro rápido

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("cotacoes.ver")) return;

  const podeEditar = temPermissao("cotacoes.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    botaoIncluir: $("botao-incluir"),
    abaLista: $("aba-lista"), abaComparativo: $("aba-comparativo"),
    painelLista: $("painel-lista"), painelComparativo: $("painel-comparativo"),
    tabelaCorpo: $("tabela-cotacoes-corpo"), estadoVazio: $("estado-vazio-lista"), estadoCarregando: $("estado-carregando"),
    campoBusca: $("campo-busca"), filtroTipo: $("filtro-tipo"),
    campoDataInicio: $("campo-data-inicio"), campoDataFim: $("campo-data-fim"),
    abasStatus: document.querySelectorAll(".aba-status[data-status]"),
    campoProduto: $("campo-produto-comparativo"), containerComparativo: $("container-comparativo"),
    tabelaComparativoCorpo: $("tabela-comparativo-corpo"), estadoVazioComparativo: $("estado-vazio-comparativo")
  };

  el.botaoIncluir.hidden = !podeEditar;

  const ROTULOS_STATUS = { rascunho: "Rascunho", enviada: "Enviada", recebida: "Recebida", aprovada: "Aprovada", recusada: "Recusada" };
  const STATUS_EM_ABERTO = ["rascunho", "enviada", "recebida"];

  function hojeTexto() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function nomeDaParte(cotacao) {
    return cotacao.tipo === "venda"
      ? (nomesCliente[cotacao.cliente_id] ?? `Cliente #${cotacao.cliente_id}`)
      : (nomesFornecedor[cotacao.fornecedor_id] ?? `Fornecedor #${cotacao.fornecedor_id}`);
  }

  // ---------- Lista ----------

  function periodoInvalido() {
    const inicio = el.campoDataInicio.value, fim = el.campoDataFim.value;
    return Boolean(inicio && fim && inicio > fim);
  }

  function cotacoesFiltradas() {
    const termo = el.campoBusca.value.trim().toLowerCase();
    const termoNumerico = termo.replace(/^#/, "");
    const inicio = el.campoDataInicio.value, fim = el.campoDataFim.value;

    return cotacoesCache.filter(c => {
      if (termo) {
        const casaNumero = /^\d+$/.test(termoNumerico) && (formatarNumeroPedido(c.id).includes(termoNumerico) || String(c.id).includes(termoNumerico));
        if (!nomeDaParte(c).toLowerCase().includes(termo) && !casaNumero) return false;
      }
      const dia = String(c.data_cotacao).slice(0, 10);
      if (inicio && dia < inicio) return false;
      if (fim && dia > fim) return false;
      return true;
    });
  }

  function mostrarVazio(texto, aviso = false) {
    el.tabelaCorpo.innerHTML = "";
    el.estadoVazio.textContent = texto;
    el.estadoVazio.classList.toggle("aviso-periodo", aviso);
    el.estadoVazio.hidden = false;
  }

  function renderizarTabela() {
    el.estadoCarregando.hidden = true;

    if (periodoInvalido()) {
      mostrarVazio("Período inválido: a data inicial é posterior à data final.", true);
      return;
    }
    const lista = cotacoesFiltradas();
    if (lista.length === 0) {
      mostrarVazio(cotacoesCache.length > 0 ? "Nenhuma cotação encontrada com esses filtros." : "Nenhuma cotação encontrada.");
      return;
    }

    el.estadoVazio.hidden = true;
    const hoje = hojeTexto();
    el.tabelaCorpo.innerHTML = lista
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(c => {
        const vencida = Boolean(c.validade) && c.validade < hoje && STATUS_EM_ABERTO.includes(c.status);
        const selo = vencida ? '<span class="badge-status badge-status--vencida">Vencida</span>' : "";
        const total = c.valor_total === null || c.valor_total === undefined
          ? '<td class="celula-numero celula-sem-valor">A definir</td>'
          : `<td class="celula-numero">${formatarMoeda(c.valor_total)}</td>`;
        return `
          <tr class="linha-clicavel" data-id="${c.id}" tabindex="0">
            <td class="celula-nome">${formatarNumeroPedido(c.id)}</td>
            <td><span class="badge-tipo badge-tipo--${escaparHtml(c.tipo)}">${c.tipo === "venda" ? "Venda" : "Compra"}</span></td>
            <td>${escaparHtml(nomeDaParte(c))}</td>
            <td>${formatarData(c.data_cotacao)}</td>
            <td${vencida ? ' class="celula-vencida"' : ""}>${c.validade ? formatarData(c.validade) : "—"}</td>
            <td>${c.itens.length} ${c.itens.length === 1 ? "item" : "itens"}</td>
            ${total}
            <td><span class="badge-status badge-status--${escaparHtml(c.status)}">${escaparHtml(ROTULOS_STATUS[c.status] || c.status)}</span>${selo}</td>
          </tr>`;
      }).join("");
  }

  async function carregarNomes() {
    const [rForn, rCli] = await Promise.allSettled([
      fornecedorService.listar({ incluirInativos: true }),
      clienteService.listar({ incluirInativos: true })
    ]);
    if (rForn.status === "fulfilled") nomesFornecedor = Object.fromEntries(rForn.value.map(f => [f.id, f.nome]));
    if (rCli.status === "fulfilled") nomesCliente = Object.fromEntries(rCli.value.map(c => [c.id, c.nome]));
    if (rForn.status === "rejected" || rCli.status === "rejected") {
      // Sem o nome a cotação ainda aparece como "Fornecedor #id" / "Cliente #id"; avisa e segue.
      toast.erro("Não foi possível carregar todos os nomes de fornecedores e clientes.");
    }
  }

  async function carregarCotacoes() {
    const minha = ++requisicaoAtual;
    el.tabelaCorpo.innerHTML = "";
    el.estadoVazio.hidden = true;
    el.estadoCarregando.hidden = false;
    try {
      const dados = await cotacaoService.listar({
        tipo: el.filtroTipo.value || null,
        status: filtroStatusAtivo === "todos" ? null : filtroStatusAtivo
      });
      if (minha !== requisicaoAtual) return;
      cotacoesCache = dados;
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      cotacoesCache = [];
      mostrarVazio("Não foi possível carregar as cotações.");
      toast.erro(erro.message);
    }
  }

  function abrirCotacao(linha) {
    if (linha) window.location.href = `cotacao-detalhe.html?id=${linha.dataset.id}`;
  }

  el.botaoIncluir.addEventListener("click", () => { window.location.href = "cotacao-nova.html"; });
  el.tabelaCorpo.addEventListener("click", (e) => abrirCotacao(e.target.closest("tr[data-id]")));
  el.tabelaCorpo.addEventListener("keydown", (e) => { if (e.key === "Enter") abrirCotacao(e.target.closest("tr[data-id]")); });

  el.abasStatus.forEach(aba => {
    aba.addEventListener("click", () => {
      el.abasStatus.forEach(a => a.classList.remove("aba-status--ativa"));
      aba.classList.add("aba-status--ativa");
      filtroStatusAtivo = aba.dataset.status;
      carregarCotacoes();
    });
  });
  el.filtroTipo.addEventListener("change", carregarCotacoes);
  el.campoBusca.addEventListener("input", renderizarTabela);
  el.campoDataInicio.addEventListener("change", renderizarTabela);
  el.campoDataFim.addEventListener("change", renderizarTabela);

  // ---------- Comparativo de preços ----------

  let requisicaoComparativo = 0;

  async function carregarProdutos() {
    try {
      const produtos = (await produtoService.listar()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      el.campoProduto.innerHTML = '<option value="">Selecione um produto...</option>' +
        produtos.map(p => `<option value="${p.id}">${escaparHtml(p.nome)}</option>`).join("");
    } catch (erro) {
      el.campoProduto.innerHTML = '<option value="">Falha ao carregar</option>';
      toast.erro(`Não foi possível carregar os produtos. ${erro.message}`);
    }
  }

  async function carregarComparativo(produtoId) {
    const minha = ++requisicaoComparativo;
    el.containerComparativo.hidden = true;
    el.estadoVazioComparativo.hidden = true;
    if (!produtoId) return;

    try {
      const resultados = await cotacaoService.comparativoPorProduto(produtoId);
      if (minha !== requisicaoComparativo) return;
      if (resultados.length === 0) {
        el.estadoVazioComparativo.hidden = false;
        return;
      }
      // Compara pelo preço na unidade base: cotações feitas com embalagens diferentes (ex.: Pote de 5 L x Litro) ficam justas.
      const melhor = Number(resultados[0].preco_unidade_base);
      el.tabelaComparativoCorpo.innerHTML = resultados.map((item, i) => {
        const preco = Number(item.preco_unidade_base);
        const pct = melhor > 0 ? ((preco - melhor) / melhor) * 100 : 0;
        const diferenca = i === 0 || pct < 0.005
          ? '<span class="diferenca-melhor">Menor preço</span>'
          : `<span class="diferenca-positiva">+${formatarNumero(Math.round(pct * 10) / 10)}%</span>`;
        const link = `<a class="link-pedido" href="cotacao-detalhe.html?id=${item.cotacao_id}">${formatarNumeroPedido(item.cotacao_id)}</a> ` +
          `<span class="badge-status badge-status--${escaparHtml(item.status)}">${escaparHtml(ROTULOS_STATUS[item.status] || item.status)}</span>`;
        return `
          <tr>
            <td><span class="posicao-ranking ${i === 0 ? "posicao-ranking--melhor" : ""}">${i + 1}</span></td>
            <td class="celula-nome">${escaparHtml(item.fornecedor_nome)}</td>
            <td class="celula-numero">${formatarMoeda(item.preco_unitario)}${Number(item.fator) !== 1
              ? `<small class="celula-embalagem">embalagem com ${formatarNumero(item.fator)} · ${formatarMoeda(item.preco_unidade_base)} cada</small>` : ""}</td>
            <td class="celula-numero">${diferenca}</td>
            <td class="celula-numero">${formatarNumero(item.quantidade)}</td>
            <td>${link}</td>
            <td>${formatarData(item.data_cotacao)}</td>
          </tr>`;
      }).join("");
      el.containerComparativo.hidden = false;
    } catch (erro) {
      if (minha === requisicaoComparativo) toast.erro(erro.message);
    }
  }

  el.campoProduto.addEventListener("change", () => carregarComparativo(el.campoProduto.value));

  // ---------- Abas principais ----------

  function trocarAba(aba) {
    const lista = aba === "lista";
    el.abaLista.classList.toggle("aba-secundaria--ativa", lista);
    el.abaComparativo.classList.toggle("aba-secundaria--ativa", !lista);
    el.painelLista.hidden = !lista;
    el.painelComparativo.hidden = lista;
    el.botaoIncluir.hidden = !(lista && podeEditar);
  }

  el.abaLista.addEventListener("click", () => trocarAba("lista"));
  el.abaComparativo.addEventListener("click", () => trocarAba("comparativo"));

  // ---------- Carga ----------

  // Voltando da exclusão de uma cotação no detalhe
  const excluida = new URLSearchParams(window.location.search).get("excluida");
  if (excluida) {
    toast.sucesso(`Cotação ${formatarNumeroPedido(excluida)} excluída.`);
    history.replaceState(null, "", "cotacoes.html");
  }

  await carregarNomes();
  await carregarCotacoes();
  await carregarProdutos();
});
