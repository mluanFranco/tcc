// Lógica da tela de Produtos: cadastro/subcategoria/unidade dependentes,
// tipo de produto (insumo/vendável) e cálculo somente-leitura de preço de venda.
// Embalagem (opcional): ex.: base Litro + embalagem Pote com 5. Preços são da embalagem; estoque e mínimo, da unidade base.

let produtosCache = [];          // ativos + inativos (para achar o produto clicado)
let produtosAtivos = [];
let produtosInativos = [];
let categoriasCache = [];
let subcategoriasCacheGlobal = [];
let unidadesCache = [];          // ativas: opções dos selects
let siglasPorUnidade = {};       // todas (inclusive inativas): { id: "L" }
let abaAtiva = "ativos";
let produtosVisiveis = [];       // o que a tabela está mostrando (base da exportação)
let produtoEmEdicaoId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirAutenticacao()) return;

  // Cadastros: qualquer usuário logado consulta; criar, editar e desativar exigem cadastros.editar.
  const podeEditar = temPermissao("cadastros.editar");

  aplicarMascaraMoeda(document.getElementById("campo-preco-custo"));

  const elementos = {
    tabelaCorpo: document.getElementById("tabela-produtos-corpo"),
    estadoVazio: document.getElementById("estado-vazio"),
    estadoCarregando: document.getElementById("estado-carregando"),
    campoBusca: document.getElementById("campo-busca"),
    abaAtivos: document.getElementById("aba-ativos"),
    abaInativos: document.getElementById("aba-inativos"),
    abaEstoqueBaixo: document.getElementById("aba-estoque-baixo"),
    abaSemEstoque: document.getElementById("aba-sem-estoque"),
    contadorEstoqueBaixo: document.getElementById("contador-estoque-baixo"),
    contadorAtivos: document.getElementById("contador-ativos"),
    contadorSemEstoque: document.getElementById("contador-sem-estoque"),
    contadorInativos: document.getElementById("contador-inativos"),
    filtroCategoria: document.getElementById("filtro-categoria"),
    filtroTipo: document.getElementById("filtro-tipo"),
    kpis: document.getElementById("kpis-produtos"),
    subtitulo: document.getElementById("subtitulo-produtos"),
    rodape: document.getElementById("rodape-produtos"),
    contagem: document.getElementById("contagem-produtos"),
    botaoIncluir: document.getElementById("botao-incluir"),
    campoCategoria: document.getElementById("campo-categoria"),
    campoSubcategoria: document.getElementById("campo-subcategoria"),
    campoUnidade: document.getElementById("campo-unidade"),
    campoEInsumo: document.getElementById("campo-e-insumo"),
    campoEVendavel: document.getElementById("campo-e-vendavel"),
    blocoPorcentagem: document.getElementById("bloco-porcentagem"),
    campoPorcentagem: document.getElementById("campo-porcentagem"),
    blocoPrecoVenda: document.getElementById("bloco-preco-venda"),
    campoPrecoCusto: document.getElementById("campo-preco-custo"),
    campoPrecoVenda: document.getElementById("campo-preco-venda"),
    campoEmbalagem: document.getElementById("campo-embalagem"),
    campoFator: document.getElementById("campo-fator"),
    grupoEmbalagem: document.getElementById("grupo-embalagem"),
    grupoFator: document.getElementById("grupo-fator"),
    labelFator: document.getElementById("label-fator"),
    labelPrecoCusto: document.getElementById("label-preco-custo"),
    labelPrecoVenda: document.getElementById("label-preco-venda"),
    labelEstoqueMinimo: document.getElementById("label-estoque-minimo"),
    dicaCustoBase: document.getElementById("dica-custo-base"),
    dicaEstoqueMinimo: document.getElementById("dica-estoque-minimo"),
    campoEstoqueMinimo: document.getElementById("campo-estoque-minimo"),
    modalOverlay: document.getElementById("modal-produto"),
    modalTitulo: document.getElementById("modal-titulo"),
    modalFechar: document.getElementById("modal-fechar"),
    modalCancelar: document.getElementById("modal-cancelar"),
    form: document.getElementById("form-produto"),
    modalVisualizarOverlay: document.getElementById("modal-visualizar-produto"),
    modalVisualizarFechar: document.getElementById("modal-visualizar-fechar"),
    modalVisualizarFecharRodape: document.getElementById("modal-visualizar-fechar-rodape")
  };

  // ---------- Resolução de nomes (categoria/subcategoria/unidade) ----------

  function nomeCategoria(id) {
    const c = categoriasCache.find(c => c.id === id);
    return c ? c.nome : "—";
  }

  function nomeSubcategoria(id) {
    const s = subcategoriasCacheGlobal.find(s => s.id === id);
    return s ? s.nome : "—";
  }

  function nomeUnidade(id) {
    const u = unidadesCache.find(u => u.id === id);
    return u ? `${u.nome} (${u.sigla})` : "—";
  }

  function rotuloTipo(produto) {
    if (produto.e_insumo && produto.e_vendavel) return "Insumo + Vendável";
    if (produto.e_insumo) return "Insumo";
    if (produto.e_vendavel) return "Vendável";
    return "—";
  }

  // ---------- Carregamento dos selects de apoio ----------

  async function carregarListasDeApoio() {
    try {
      let unidadesTodas;
      [categoriasCache, unidadesTodas, subcategoriasCacheGlobal] = await Promise.all([
        categoriaService.listar(),
        unidadeMedidaService.listar({ incluirInativos: true }),
        subcategoriaService.listar()
      ]);
      unidadesCache = unidadesTodas.filter(u => u.ativo);
      siglasPorUnidade = Object.fromEntries(unidadesTodas.map(u => [u.id, u.sigla]));

      elementos.campoCategoria.innerHTML =
        `<option value="">Selecione...</option>` +
        categoriasCache.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join("");
      elementos.filtroCategoria.innerHTML =
        `<option value="">Todas as categorias</option>` +
        categoriasCache.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join("");

      const opcoesUnidade = unidadesCache.map(u => `<option value="${u.id}">${escaparHtml(u.nome)} (${escaparHtml(u.sigla)})</option>`).join("");
      elementos.campoUnidade.innerHTML = `<option value="">Selecione...</option>` + opcoesUnidade;
      elementos.campoEmbalagem.innerHTML = `<option value="">Sem embalagem</option>` + opcoesUnidade;
    } catch (erro) {
      toast.erro("Não foi possível carregar categorias e unidades: " + erro.message);
    }
  }

  async function atualizarSubcategoriasPorCategoria(categoriaId, subcategoriaSelecionadaId = null) {
    if (!categoriaId) {
      elementos.campoSubcategoria.innerHTML = `<option value="">Selecione a categoria primeiro...</option>`;
      elementos.campoSubcategoria.disabled = true;
      return;
    }

    try {
      const subcategorias = await subcategoriaService.listar({ categoriaId });
      elementos.campoSubcategoria.innerHTML =
        `<option value="">Selecione...</option>` +
        subcategorias.map(s => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("");
      elementos.campoSubcategoria.disabled = false;

      if (subcategoriaSelecionadaId) {
        elementos.campoSubcategoria.value = subcategoriaSelecionadaId;
      }
    } catch (erro) {
      toast.erro("Não foi possível carregar as subcategorias: " + erro.message);
    }
  }

  // ---------- Visibilidade condicional (tipo vendável) ----------

  function atualizarVisibilidadeCamposVenda() {
    const vendavel = elementos.campoEVendavel.checked;
    elementos.blocoPorcentagem.style.display = vendavel ? "flex" : "none";
    elementos.blocoPrecoVenda.style.display = vendavel ? "flex" : "none";
    elementos.campoPorcentagem.required = vendavel;
    if (!vendavel) {
      elementos.campoPorcentagem.value = "";
      elementos.campoPrecoVenda.value = "";
    }
    atualizarPreviewPrecoVenda();
  }

  // Preview local, só para feedback visual — o valor real vem do backend na resposta.
  function atualizarPreviewPrecoVenda() {
    if (!elementos.campoEVendavel.checked) return;
    const custo = moedaParaNumero(elementos.campoPrecoCusto.value);
    const porcentagem = parseFloat(elementos.campoPorcentagem.value);
    if (custo == null || isNaN(porcentagem)) {
      elementos.campoPrecoVenda.value = "";
      return;
    }
    const precoVenda = custo + (custo * porcentagem / 100);
    elementos.campoPrecoVenda.value = numeroParaMoeda(precoVenda);
  }

  // ---------- Embalagem: rótulos e dicas acompanham o que está selecionado ----------

  const siglaSelecionada = (select) => siglasPorUnidade[Number(select.value)] || "";

  function atualizarEmbalagem() {
    const base = siglaSelecionada(elementos.campoUnidade) || "unidade base";
    const temEmb = Boolean(elementos.campoEmbalagem.value);
    const emb = siglaSelecionada(elementos.campoEmbalagem) || "embalagem";
    const fator = Number(elementos.campoFator.value);

    elementos.campoFator.disabled = !temEmb;
    if (!temEmb) {
      elementos.campoFator.value = "";
      elementos.grupoFator.classList.remove("invalido");
    }
    elementos.labelFator.textContent = temEmb ? `Quantos ${base} cabem em 1 ${emb} *` : "Quanto cabe em 1 embalagem";
    elementos.labelPrecoCusto.textContent = temEmb ? `Preço de custo (por ${emb}) *` : "Preço de custo *";
    elementos.labelPrecoVenda.textContent = temEmb ? `Preço de venda (por ${emb}, calculado)` : "Preço de venda (calculado)";
    elementos.labelEstoqueMinimo.textContent = `Estoque mínimo (em ${base})`;

    const custo = moedaParaNumero(elementos.campoPrecoCusto.value);
    const valido = temEmb && fator > 0 && fator !== 1;
    elementos.dicaCustoBase.hidden = !(valido && custo != null);
    if (valido && custo != null) {
      elementos.dicaCustoBase.textContent = `1 ${emb} = ${formatarNumero(fator)} ${base} · custo por ${base}: ${formatarMoeda(custo / fator)} (é o valor usado nas receitas e na produção).`;
    }
    const minimo = Number(elementos.campoEstoqueMinimo.value);
    elementos.dicaEstoqueMinimo.hidden = !(valido && minimo > 0);
    if (valido && minimo > 0) {
      elementos.dicaEstoqueMinimo.textContent = `= ${formatarNumero(Math.round(minimo / fator * 1000) / 1000)} ${emb}`;
    }
  }

  // ---------- Tabela ----------

  // Situação do estoque (mesma regra do alerta do backend: estoque baixo = atual <= mínimo)
  function situacaoEstoque(produto) {
    if (Number(produto.estoque_disponivel ?? 0) <= 0) return { chave: "zero", texto: "Sem estoque" };
    if (Number(produto.estoque_atual) <= Number(produto.estoque_minimo)) return { chave: "baixo", texto: "Baixo" };
    return { chave: "ok", texto: "Em dia" };
  }

  const MENSAGENS_VAZIO = {
    "ativos": "Nenhum produto encontrado.",
    "inativos": "Nenhum produto inativo.",
    "estoque-baixo": "Nenhum produto com estoque baixo. Tudo acima do mínimo!",
    "sem-estoque": "Nenhum produto zerado. Todos têm saldo disponível."
  };
  const CORES_CATEGORIA = [["#EEF3FF", "#0F59FD"], ["#F3EEFF", "#6D28D9"], ["#E9F8EF", "#12A150"],
                           ["#FFF6E5", "#B7791F"], ["#FEF2F2", "#DC2626"], ["#E8F7FB", "#0E7490"]];

  let requisicaoAtual = 0;

  // Carrega ativos e inativos juntos: os indicadores e os contadores das abas usam as duas listas.
  async function carregarProdutos() {
    const minha = ++requisicaoAtual;
    elementos.estadoCarregando.style.display = "block";
    elementos.estadoVazio.style.display = "none";
    elementos.tabelaCorpo.innerHTML = "";
    try {
      const [ativos, inativos] = await Promise.all([produtoService.listar(), produtoService.listarInativos()]);
      if (minha !== requisicaoAtual) return;
      produtosAtivos = ativos;
      produtosInativos = inativos;
      produtosCache = [...ativos, ...inativos];
      elementos.estadoCarregando.style.display = "none";
      renderizarResumo();
      renderizarTabela();
    } catch (erro) {
      if (minha !== requisicaoAtual) return;
      elementos.estadoCarregando.style.display = "none";
      toast.erro(erro.message);
    }
  }

  function renderizarResumo() {
    const baixos = produtosAtivos.filter(p => situacaoEstoque(p).chave !== "ok").length;
    const zerados = produtosAtivos.filter(p => situacaoEstoque(p).chave === "zero").length;
    const valor = produtosAtivos.reduce((soma, p) => soma + Number(p.estoque_atual || 0) * Number(p.custo_unidade_base || 0), 0);
    const vendaveis = produtosAtivos.filter(p => p.e_vendavel).length;
    const insumos = produtosAtivos.filter(p => p.e_insumo).length;

    elementos.subtitulo.textContent = `${produtosAtivos.length} produtos ativos · ${categoriasCache.length} categorias`;
    elementos.contadorAtivos.textContent = produtosAtivos.length;
    elementos.contadorEstoqueBaixo.textContent = baixos;
    elementos.contadorSemEstoque.textContent = zerados;
    elementos.contadorInativos.textContent = produtosInativos.length;

    const kpi = (aba, cor, rotulo, valorTxt, nota) => {
      const tag = aba ? "button" : "div";
      const sel = aba && aba === abaAtiva ? " kpi--selecionado" : "";
      return `<${tag} class="kpi${sel}" ${aba ? `type="button" data-aba="${aba}"` : ""}>
          <span class="kpi__rotulo"><span class="kpi__ponto" style="background:${cor}"></span>${rotulo}</span>
          <span class="kpi__valor" style="display:block">${valorTxt}</span>
          <span class="kpi__nota" style="display:block">${nota}</span>
        </${tag}>`;
    };
    elementos.kpis.innerHTML =
      kpi("ativos", "var(--azul-acao)", "Produtos ativos", produtosAtivos.length, `${vendaveis} vendáveis · ${insumos} insumos`) +
      kpi("estoque-baixo", "var(--ambar)", "Estoque baixo", baixos, "no mínimo ou abaixo dele") +
      kpi("sem-estoque", "var(--erro)", "Sem estoque", zerados, "nada disponível para venda ou uso") +
      kpi(null, "var(--verde)", "Valor em estoque", escaparHtml(formatarMoeda(valor)), "pelo custo da unidade base");
  }

  function produtosDaAba() {
    if (abaAtiva === "inativos") return produtosInativos;
    if (abaAtiva === "estoque-baixo") return produtosAtivos.filter(p => situacaoEstoque(p).chave !== "ok");
    if (abaAtiva === "sem-estoque") return produtosAtivos.filter(p => situacaoEstoque(p).chave === "zero");
    return produtosAtivos;
  }

  function iniciais(nome) {
    const partes = nome.split(" ").filter(p => p.length > 2);
    return (partes.length ? partes : [nome]).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  }

  function celulaEstoque(produto) {
    const sit = situacaoEstoque(produto);
    const base = siglasPorUnidade[produto.unidade_medida_id] || "";
    const disponivel = Number(produto.estoque_disponivel ?? 0);
    const minimo = Number(produto.estoque_minimo || 0);
    const reservado = Number(produto.estoque_reservado || 0);
    // A barra enche ao chegar a 2x o mínimo: dá para ver de longe o que está perto de acabar
    const pct = minimo > 0 ? Math.max(0, Math.min(100, disponivel / (minimo * 2) * 100)) : (disponivel > 0 ? 100 : 0);
    const cor = { ok: "var(--verde)", baixo: "#E0A030", zero: "var(--erro)" }[sit.chave];
    const fator = fatorEmbalagem(produto);
    const detalhes = [];
    if (reservado > 0) detalhes.push(`${formatarNumero(reservado)} ${base} reservado`);
    if (fator !== 1 && produto.embalagem_unidade_id) {
      detalhes.push(`${formatarNumero(Math.round(disponivel / fator * 1000) / 1000)} ${siglasPorUnidade[produto.embalagem_unidade_id] || "emb."}`);
    }
    return `<div class="nivel">
        <div class="nivel__linha"><span class="nivel__qtd">${escaparHtml(formatarNumero(disponivel))} ${escaparHtml(base)}</span>
          <span class="nivel__situacao nivel__situacao--${sit.chave}">${sit.texto}</span></div>
        <div class="nivel__barra"><span style="width:${pct}%;background:${cor}"></span></div>
        ${detalhes.length ? `<div class="nivel__detalhe">${escaparHtml(detalhes.join(" · "))}</div>` : ""}
      </div>`;
  }

  function renderizarTabela() {
    const termoBusca = elementos.campoBusca.value.trim().toLowerCase();
    const categoria = elementos.filtroCategoria.value;
    const tipo = elementos.filtroTipo.value;
    const daAba = produtosDaAba();

    const produtosFiltrados = daAba.filter(produto => {
      if (categoria && String(produto.categoria_id) !== categoria) return false;
      if (tipo === "insumo" && !produto.e_insumo) return false;
      if (tipo === "vendavel" && !produto.e_vendavel) return false;
      if (!termoBusca) return true;
      return (
        produto.nome.toLowerCase().includes(termoBusca) ||
        nomeCategoria(produto.categoria_id).toLowerCase().includes(termoBusca) ||
        nomeSubcategoria(produto.subcategoria_id).toLowerCase().includes(termoBusca)
      );
    });
    produtosVisiveis = produtosFiltrados;

    elementos.abaAtivos.classList.toggle("aba-status--ativa", abaAtiva === "ativos");
    elementos.abaEstoqueBaixo.classList.toggle("aba-status--ativa", abaAtiva === "estoque-baixo");
    elementos.abaSemEstoque.classList.toggle("aba-status--ativa", abaAtiva === "sem-estoque");
    elementos.abaInativos.classList.toggle("aba-status--ativa", abaAtiva === "inativos");
    elementos.kpis.querySelectorAll("[data-aba]").forEach(k => k.classList.toggle("kpi--selecionado", k.dataset.aba === abaAtiva));

    elementos.rodape.hidden = false;
    elementos.contagem.textContent = `Mostrando ${produtosFiltrados.length} de ${daAba.length} produtos`;

    if (produtosFiltrados.length === 0) {
      elementos.tabelaCorpo.innerHTML = "";
      const filtrando = termoBusca || categoria || tipo;
      elementos.estadoVazio.textContent = daAba.length === 0 || !filtrando ? MENSAGENS_VAZIO[abaAtiva] : "Nenhum produto encontrado com esses filtros.";
      elementos.estadoVazio.style.display = "block";
      return;
    }

    elementos.estadoVazio.style.display = "none";

    elementos.tabelaCorpo.innerHTML = produtosFiltrados.map(produto => {
      const nome = escaparHtml(produto.nome);
      const [fundo, cor] = CORES_CATEGORIA[(produto.categoria_id || 0) % CORES_CATEGORIA.length];
      const emEmbalagem = fatorEmbalagem(produto) !== 1 && produto.embalagem_unidade_id;

      let botoesEdicao = "";
      if (podeEditar) {
        const botaoAtivacao = produto.ativo
          ? `<button class="botao-icone botao-icone--perigo" data-acao="desativar" data-id="${produto.id}" title="Desativar" aria-label="Desativar ${nome}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
             </button>`
          : `<button class="botao-icone" data-acao="reativar" data-id="${produto.id}" title="Reativar" aria-label="Reativar ${nome}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
             </button>`;
        botoesEdicao = `
            <button class="botao-icone" data-acao="editar" data-id="${produto.id}" title="Editar" aria-label="Editar ${nome}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            </button>
            ${botaoAtivacao}`;
      }

      const chips = (produto.ativo ? "" : '<span class="chip chip--cinza">Inativo</span>') +
        (produto.e_insumo ? '<span class="chip chip--roxo">Insumo</span>' : "") +
        (produto.e_vendavel ? '<span class="chip chip--azul">Vendável</span>' : "");
      const preco = produto.e_vendavel
        ? `<span style="font-weight:600">${escaparHtml(formatarMoeda(produto.preco_venda))}</span>${emEmbalagem ? `<small class="celula-embalagem">por ${escaparHtml(siglaNegociacao(produto, siglasPorUnidade))}</small>` : ""}`
        : '<span style="color:var(--texto-suave)">—</span>';

      return `
        <tr>
          <td>
            <div class="celula-titulo">
              <div class="celula-titulo__icone" style="background:${fundo};color:${cor}">${escaparHtml(iniciais(produto.nome))}</div>
              <div style="min-width:0">
                <div class="celula-titulo__nome">${nome}</div>
                <div class="celula-titulo__sub">${escaparHtml(nomeCategoria(produto.categoria_id))} · ${escaparHtml(nomeSubcategoria(produto.subcategoria_id))}</div>
              </div>
            </div>
          </td>
          <td>${chips}</td>
          <td class="num">${preco}</td>
          <td>${celulaEstoque(produto)}</td>
          <td class="num" style="color:#4B5563">${escaparHtml(textoEstoque(produto.estoque_minimo, produto, siglasPorUnidade).split(" (")[0])}</td>
          <td class="celula-acoes">
            <button class="botao-icone" data-acao="visualizar" data-id="${produto.id}" title="Visualizar" aria-label="Visualizar ${nome}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>${botoesEdicao}
          </td>
        </tr>
      `;
    }).join("");
  }

  // ---------- Modal de visualização ----------

  function abrirModalVisualizacao(produto) {
    document.getElementById("vis-nome").textContent = produto.nome;
    document.getElementById("vis-status").textContent = produto.ativo ? "Ativo" : "Inativo";
    document.getElementById("vis-categoria").textContent = nomeCategoria(produto.categoria_id);
    document.getElementById("vis-subcategoria").textContent = nomeSubcategoria(produto.subcategoria_id);
    document.getElementById("vis-unidade").textContent = nomeUnidade(produto.unidade_medida_id);
    const comEmbalagem = fatorEmbalagem(produto) !== 1 && produto.embalagem_unidade_id;
    const sufixoPreco = comEmbalagem ? ` por ${siglaNegociacao(produto, siglasPorUnidade)}` : "";
    document.getElementById("vis-embalagem").textContent = comEmbalagem
      ? `${siglasPorUnidade[produto.embalagem_unidade_id] || "—"} = ${formatarNumero(produto.fator_embalagem)} ${siglasPorUnidade[produto.unidade_medida_id] || ""}`
      : "Sem embalagem";
    document.getElementById("vis-tipo").textContent = rotuloTipo(produto);
    document.getElementById("vis-descricao").textContent = produto.descricao ?? "—";
    document.getElementById("vis-preco-custo").textContent = formatarMoeda(produto.preco_custo) + sufixoPreco
      + (comEmbalagem ? ` (${formatarMoeda(produto.custo_unidade_base)} por ${siglasPorUnidade[produto.unidade_medida_id] || "unidade"})` : "");
    document.getElementById("vis-porcentagem").textContent =
      produto.porcentagem != null ? `${produto.porcentagem}%` : "—";
    document.getElementById("vis-preco-venda").textContent = produto.preco_venda != null ? formatarMoeda(produto.preco_venda) + sufixoPreco : "—";
    document.getElementById("vis-estoque-atual").textContent = textoEstoque(produto.estoque_atual, produto, siglasPorUnidade);
    document.getElementById("vis-estoque-minimo").textContent = textoEstoque(produto.estoque_minimo, produto, siglasPorUnidade);
    document.getElementById("vis-estoque-reservado").textContent = textoEstoque(produto.estoque_reservado ?? 0, produto, siglasPorUnidade);
    document.getElementById("vis-estoque-disponivel").textContent = textoEstoque(
      produto.estoque_disponivel ?? (produto.estoque_atual - (produto.estoque_reservado ?? 0)), produto, siglasPorUnidade);
    document.getElementById("vis-criado-em").textContent = formatarData(produto.created_at);

    elementos.modalVisualizarOverlay.classList.add("aberto");
  }

  function fecharModalVisualizacao() {
    elementos.modalVisualizarOverlay.classList.remove("aberto");
  }

  // ---------- Modal de criação/edição ----------

  async function abrirModal(produto = null) {
    elementos.form.reset();
    limparErrosForm();
    elementos.campoSubcategoria.innerHTML = `<option value="">Selecione a categoria primeiro...</option>`;
    elementos.campoSubcategoria.disabled = true;

    if (produto) {
      produtoEmEdicaoId = produto.id;
      elementos.modalTitulo.textContent = "Editar produto";
      document.getElementById("campo-nome").value = produto.nome;
      elementos.campoCategoria.value = produto.categoria_id;
      await atualizarSubcategoriasPorCategoria(produto.categoria_id, produto.subcategoria_id);
      elementos.campoUnidade.value = produto.unidade_medida_id;
      if (produto.embalagem_unidade_id && fatorEmbalagem(produto) !== 1) {
        elementos.campoEmbalagem.value = produto.embalagem_unidade_id;
        elementos.campoFator.value = Number(produto.fator_embalagem);
      }
      document.getElementById("campo-descricao").value = produto.descricao ?? "";
      elementos.campoEInsumo.checked = produto.e_insumo;
      elementos.campoEVendavel.checked = produto.e_vendavel;
      elementos.campoPrecoCusto.value = numeroParaMoeda(produto.preco_custo);
      if (produto.e_vendavel) {
        elementos.campoPorcentagem.value = produto.porcentagem ?? "";
      }
      document.getElementById("campo-estoque-minimo").value = produto.estoque_minimo;
      atualizarVisibilidadeCamposVenda();
    } else {
      produtoEmEdicaoId = null;
      elementos.modalTitulo.textContent = "Novo produto";
      atualizarVisibilidadeCamposVenda();
    }
    atualizarEmbalagem();

    elementos.modalOverlay.classList.add("aberto");
  }

  function fecharModal() {
    elementos.modalOverlay.classList.remove("aberto");
    produtoEmEdicaoId = null;
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

    if (!dados.categoria_id) {
      elementos.campoCategoria.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.subcategoria_id) {
      elementos.campoSubcategoria.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (!dados.unidade_medida_id) {
      elementos.campoUnidade.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    // Embalagem: unidade diferente da base e fator maior que zero e diferente de 1 (o backend valida de novo).
    if (dados.embalagem_unidade_id) {
      if (dados.embalagem_unidade_id === dados.unidade_medida_id) {
        elementos.grupoEmbalagem.classList.add("invalido");
        valido = false;
      }
      if (!(dados.fator_embalagem > 0) || dados.fator_embalagem === 1) {
        elementos.grupoFator.classList.add("invalido");
        valido = false;
      }
    }

    if (!dados.e_insumo && !dados.e_vendavel) {
      document.getElementById("erro-tipo-produto").style.display = "block";
      valido = false;
    } else {
      document.getElementById("erro-tipo-produto").style.display = "none";
    }

    if (dados.preco_custo == null || dados.preco_custo < 0) {
      elementos.campoPrecoCusto.closest(".campo-form").classList.add("invalido");
      valido = false;
    }

    if (dados.e_vendavel && (dados.porcentagem == null || isNaN(dados.porcentagem))) {
      elementos.blocoPorcentagem.classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  async function salvarProduto(evento) {
    evento.preventDefault();

    const eVendavel = elementos.campoEVendavel.checked;

    const dados = {
      nome: document.getElementById("campo-nome").value,
      categoria_id: parseInt(elementos.campoCategoria.value, 10) || null,
      subcategoria_id: parseInt(elementos.campoSubcategoria.value, 10) || null,
      unidade_medida_id: parseInt(elementos.campoUnidade.value, 10) || null,
      embalagem_unidade_id: parseInt(elementos.campoEmbalagem.value, 10) || null,
      fator_embalagem: elementos.campoEmbalagem.value ? Number(elementos.campoFator.value) : null,
      e_insumo: elementos.campoEInsumo.checked,
      e_vendavel: eVendavel,
      preco_custo: moedaParaNumero(elementos.campoPrecoCusto.value),
      porcentagem: eVendavel ? parseFloat(elementos.campoPorcentagem.value) : null,
      descricao: document.getElementById("campo-descricao").value.trim() || null,
      estoque_minimo: Number(document.getElementById("campo-estoque-minimo").value || "0")   // aceita até 3 casas (kg, L)
    };

    if (!validarForm(dados)) return;

    const botaoSalvar = document.getElementById("modal-salvar");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      const editando = !!produtoEmEdicaoId;
      if (editando) {
        await produtoService.atualizar(produtoEmEdicaoId, dados);
      } else {
        await produtoService.criar(dados);
      }
      fecharModal();
      toast.sucesso(editando ? "Produto atualizado." : "Produto cadastrado.");
      await carregarProdutos();
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

    if (acao === "visualizar") {
      const produto = produtosCache.find(p => p.id === id);
      if (produto) abrirModalVisualizacao(produto);
    }

    if (!podeEditar) return;   // o backend também bloqueia; aqui só evita ações sem botão visível

    if (acao === "editar") {
      const produto = produtosCache.find(p => p.id === id);
      if (produto) await abrirModal(produto);
    }

    if (acao === "desativar") {
      const produto = produtosCache.find(p => p.id === id);
      const confirmado = await confirmarAcao({
        titulo: "Desativar produto",
        mensagem: `"${produto ? produto.nome : "Este produto"}" deixará de aparecer na listagem de ativos. Você poderá reativá-lo depois.`,
        textoConfirmar: "Desativar",
        perigo: true
      });
      if (!confirmado) return;
      try {
        await produtoService.desativar(id);
        toast.sucesso("Produto desativado.");
        await carregarProdutos();
      } catch (erro) {
        toast.erro(erro.message);
      }
    }

    if (acao === "reativar") {
      try {
        await produtoService.reativar(id);
        toast.sucesso("Produto reativado.");
        await carregarProdutos();
      } catch (erro) {
        toast.erro(erro.message);
      }
    }
  }

  // As abas só filtram o que já foi carregado (ativos e inativos vêm juntos)
  function trocarAba(novaAba) {
    abaAtiva = novaAba;
    renderizarTabela();
  }

  // ---------- Listeners ----------

  elementos.botaoIncluir.hidden = !podeEditar;
  elementos.botaoIncluir.addEventListener("click", () => abrirModal());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    fecharModal();
    fecharModalVisualizacao();
  });
  elementos.modalFechar.addEventListener("click", fecharModal);
  elementos.modalCancelar.addEventListener("click", fecharModal);
  elementos.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalOverlay) fecharModal();
  });
  elementos.form.addEventListener("submit", salvarProduto);
  elementos.campoBusca.addEventListener("input", renderizarTabela);
  elementos.abaAtivos.addEventListener("click", () => trocarAba("ativos"));
  elementos.abaInativos.addEventListener("click", () => trocarAba("inativos"));
  elementos.abaEstoqueBaixo.addEventListener("click", () => trocarAba("estoque-baixo"));
  elementos.abaSemEstoque.addEventListener("click", () => trocarAba("sem-estoque"));
  elementos.filtroCategoria.addEventListener("change", renderizarTabela);
  elementos.filtroTipo.addEventListener("change", renderizarTabela);
  elementos.kpis.addEventListener("click", (e) => {
    const kpi = e.target.closest("[data-aba]");
    if (kpi) trocarAba(kpi.dataset.aba);
  });
  elementos.tabelaCorpo.addEventListener("click", tratarAcaoTabela);
  elementos.modalVisualizarFechar.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarFecharRodape.addEventListener("click", fecharModalVisualizacao);
  elementos.modalVisualizarOverlay.addEventListener("click", (e) => {
    if (e.target === elementos.modalVisualizarOverlay) fecharModalVisualizacao();
  });

  elementos.campoCategoria.addEventListener("change", () => {
    atualizarSubcategoriasPorCategoria(elementos.campoCategoria.value || null);
  });
  elementos.campoEVendavel.addEventListener("change", atualizarVisibilidadeCamposVenda);
  elementos.campoPrecoCusto.addEventListener("input", atualizarPreviewPrecoVenda);
  elementos.campoUnidade.addEventListener("change", atualizarEmbalagem);
  elementos.campoEmbalagem.addEventListener("change", atualizarEmbalagem);
  elementos.campoFator.addEventListener("input", atualizarEmbalagem);
  elementos.campoPrecoCusto.addEventListener("input", atualizarEmbalagem);
  elementos.campoEstoqueMinimo.addEventListener("input", atualizarEmbalagem);
  elementos.campoPorcentagem.addEventListener("input", atualizarPreviewPrecoVenda);

  // Exportar (PDF/Excel): cadastros em massa só para quem pode editar cadastros
  if (temPermissao("cadastros.editar")) {
    exportador.montar({
      modulo: "produtos",
      obterIds: () => produtosVisiveis.map(p => p.id),
      obterFiltros: () => [["Aba", exportador.textoAbaAtiva(".aba-status")], ["Busca", elementos.campoBusca.value],
                           ["Categoria", exportador.textoSelect(elementos.filtroCategoria)], ["Tipo", exportador.textoSelect(elementos.filtroTipo)]]
    });
  }

  await carregarListasDeApoio();
  await carregarProdutos();
});