// Lógica da tela de detalhe de Cotação.
// Sem ?id na URL: modo de criação (cabeçalho + itens editáveis).
// Com ?id na URL: carrega a cotação existente, somente leitura nos itens
// (apenas o status pode ser atualizado para uma cotação já existente).

let cotacaoAtual = null;
let produtosDisponiveis = [];
let fornecedoresDisponiveis = [];
let itensDoFormulario = []; // [{ produto_id, preco_unitario, quantidade_referencia, observacao }]

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  const params = new URLSearchParams(window.location.search);
  const cotacaoId = params.get("id");

  const elementos = {
    titulo: document.getElementById("detalhe-titulo"),
    botaoVoltar: document.getElementById("botao-voltar"),
    campoFornecedor: document.getElementById("campo-fornecedor"),
    campoStatus: document.getElementById("campo-status"),
    campoObservacao: document.getElementById("campo-observacao"),
    tabelaItensCorpo: document.getElementById("tabela-itens-corpo"),
    itensVazio: document.getElementById("itens-vazio"),
    botaoAdicionarItem: document.getElementById("botao-adicionar-item"),
    acoesContainer: document.getElementById("acoes-container")
  };

  async function carregarDadosDeApoio() {
    [produtosDisponiveis, fornecedoresDisponiveis] = await Promise.all([
      produtoService.listar(),
      fornecedorService.listar()
    ]);

    elementos.campoFornecedor.innerHTML = '<option value="">Selecione um fornecedor...</option>' +
      fornecedoresDisponiveis.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");
  }

  function produtoPorId(id) {
    return produtosDisponiveis.find(p => p.id === Number(id));
  }

  function renderizarItens() {
    if (itensDoFormulario.length === 0) {
      elementos.tabelaItensCorpo.innerHTML = "";
      elementos.itensVazio.style.display = "block";
      return;
    }

    elementos.itensVazio.style.display = "none";

    elementos.tabelaItensCorpo.innerHTML = itensDoFormulario.map((item, index) => {
      const opcoesProduto = produtosDisponiveis.map(p =>
        `<option value="${p.id}" ${Number(item.produto_id) === p.id ? "selected" : ""}>${p.nome}</option>`
      ).join("");

      return `
        <tr>
          <td>
            <select data-index="${index}" data-campo="produto_id">
              <option value="">Selecione...</option>
              ${opcoesProduto}
            </select>
          </td>
          <td class="coluna-preco">
            <input type="number" min="0" step="0.01" data-index="${index}" data-campo="preco_unitario" value="${item.preco_unitario}">
          </td>
          <td class="coluna-qtd">
            <input type="number" min="1" data-index="${index}" data-campo="quantidade_referencia" value="${item.quantidade_referencia}">
          </td>
          <td>
            <input type="text" data-index="${index}" data-campo="observacao" value="${item.observacao ?? ""}" placeholder="Opcional">
          </td>
          <td class="coluna-acao">
            <button type="button" class="botao-remover-item" data-remover="${index}" aria-label="Remover item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderizarItensSomenteLeitura() {
    if (itensDoFormulario.length === 0) {
      elementos.tabelaItensCorpo.innerHTML = "";
      elementos.itensVazio.style.display = "block";
      return;
    }

    elementos.itensVazio.style.display = "none";

    elementos.tabelaItensCorpo.innerHTML = itensDoFormulario.map(item => {
      const produto = produtoPorId(item.produto_id);
      return `
        <tr>
          <td>${produto ? produto.nome : `Produto #${item.produto_id}`}</td>
          <td>R$ ${Number(item.preco_unitario).toFixed(2).replace(".", ",")}</td>
          <td>${item.quantidade_referencia}</td>
          <td>${item.observacao ?? "—"}</td>
          <td></td>
        </tr>
      `;
    }).join("");
  }

  function adicionarLinhaItem() {
    itensDoFormulario.push({ produto_id: "", preco_unitario: 0, quantidade_referencia: 1, observacao: "" });
    renderizarItens();
  }

  elementos.tabelaItensCorpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const index = evento.target.dataset.index;
    if (campo === undefined || index === undefined) return;
    itensDoFormulario[index][campo] = evento.target.value;
  });

  elementos.tabelaItensCorpo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-remover]");
    if (!botao) return;
    itensDoFormulario.splice(Number(botao.dataset.remover), 1);
    renderizarItens();
  });

  function renderizarAcoes() {
    elementos.acoesContainer.innerHTML = "";

    if (!cotacaoAtual) {
      elementos.acoesContainer.innerHTML = `<button class="botao-primario" id="botao-salvar">Salvar cotação</button>`;
      document.getElementById("botao-salvar").addEventListener("click", salvarCotacao);
      return;
    }

    elementos.acoesContainer.innerHTML = `<button class="botao-primario" id="botao-salvar">Salvar status</button>`;
    document.getElementById("botao-salvar").addEventListener("click", salvarCotacao);
  }

  async function salvarCotacao() {
    const botaoSalvar = document.getElementById("botao-salvar");

    if (cotacaoAtual) {
      // Cotação existente: itens não são editáveis (a API não expõe edição
      // de itens), apenas o status pode ser atualizado livremente.
      botaoSalvar.disabled = true;
      botaoSalvar.textContent = "Salvando...";
      try {
        await cotacaoService.atualizarStatus(cotacaoAtual.id, elementos.campoStatus.value);
        alert("Status atualizado com sucesso.");
        window.location.href = "cotacoes.html";
      } catch (erro) {
        alert(erro.message);
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = "Salvar status";
      }
      return;
    }

    if (!elementos.campoFornecedor.value) {
      alert("Selecione um fornecedor.");
      return;
    }

    if (itensDoFormulario.length === 0) {
      alert("Adicione ao menos um produto cotado.");
      return;
    }

    const temItemIncompleto = itensDoFormulario.some(item =>
      !item.produto_id || item.preco_unitario === "" || item.preco_unitario == null
    );
    if (temItemIncompleto) {
      alert("Selecione o produto e informe o preço unitário de todos os itens.");
      return;
    }

    const dados = {
      fornecedor_id: parseInt(elementos.campoFornecedor.value, 10),
      status: elementos.campoStatus.value,
      observacao: elementos.campoObservacao.value || null,
      itens: itensDoFormulario.map(item => ({
        produto_id: parseInt(item.produto_id, 10),
        preco_unitario: parseFloat(item.preco_unitario),
        quantidade_referencia: parseInt(item.quantidade_referencia, 10) || 1,
        observacao: item.observacao || null
      }))
    };

    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      await cotacaoService.criar(dados);
      window.location.href = "cotacoes.html";
    } catch (erro) {
      alert(erro.message);
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar cotação";
    }
  }

  function aplicarModoVisualizacao() {
    elementos.titulo.textContent = `Cotação #${cotacaoAtual.id}`;

    elementos.campoFornecedor.value = cotacaoAtual.fornecedor_id;
    elementos.campoFornecedor.disabled = true;
    elementos.campoStatus.value = cotacaoAtual.status;
    elementos.campoObservacao.value = cotacaoAtual.observacao ?? "";
    elementos.campoObservacao.disabled = true;
    elementos.botaoAdicionarItem.style.display = "none";

    itensDoFormulario = cotacaoAtual.itens.map(item => ({
      produto_id: item.produto_id,
      preco_unitario: item.preco_unitario,
      quantidade_referencia: item.quantidade_referencia,
      observacao: item.observacao
    }));

    renderizarItensSomenteLeitura();
    renderizarAcoes();
  }

  elementos.botaoVoltar.addEventListener("click", () => {
    window.location.href = "cotacoes.html";
  });

  elementos.botaoAdicionarItem.addEventListener("click", adicionarLinhaItem);

  await carregarDadosDeApoio();

  if (cotacaoId) {
    try {
      cotacaoAtual = await cotacaoService.buscarPorId(cotacaoId);
      aplicarModoVisualizacao();
    } catch (erro) {
      alert(erro.message);
      window.location.href = "cotacoes.html";
    }
  } else {
    elementos.titulo.textContent = "Nova cotação";
    renderizarItens();
    renderizarAcoes();
  }
});