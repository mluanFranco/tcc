// Dashboard: indicadores com tendência, vendas acumuladas (linha), receita por categoria (rosca), rankings,
// caixa e previsão (colunas), estoque e geladeiras (barras segmentadas).
// Cada bloco carrega e falha sozinho (com "Tentar de novo"); trocar o período recarrega só os blocos que dependem dele.
// Os "Destaques" são frases geradas a partir dos números já carregados (sem chamar nenhuma IA).
// Caixa, previsão e vencidos só aparecem com financeiro.ver; geladeiras só com geladeiras.ver.
// Dependências: auth.js, formatadores.js, graficos.js, dashboardService.js.

document.addEventListener("DOMContentLoaded", () => {
  if (!exigirPermissao("relatorios.ver")) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    select: $("periodo-select"), custom: $("periodo-custom"), inicio: $("data-inicio"), fim: $("data-fim"), aplicar: $("periodo-aplicar"),
    texto: $("periodo-texto"), erro: $("erro-periodo"), destaques: $("destaques-lista"), kpis: $("bloco-kpis"), caixaSub: $("caixa-sub")
  };

  const VER_FINANCEIRO = temPermissao("financeiro.ver");
  const VER_GELADEIRAS = temPermissao("geladeiras.ver");
  const VER_PRODUCAO = temPermissao("producao.ver");
  $("grade-producao").hidden = !VER_PRODUCAO;
  $("grade-financeiro").hidden = !VER_FINANCEIRO;
  $("bloco-geladeiras").hidden = !VER_GELADEIRAS;
  if (!VER_GELADEIRAS) $("grade-operacao").classList.add("dash-grade--uma");

  // Paleta validada para daltonismo (as cores sempre vêm com rótulo ou legenda)
  const COR = { azul: "#2a78d6", laranja: "#eb6834", cinza: "#8A94A6", bom: "#12A150", atencao: "#D99000", critico: "#DC2626" };
  const CORES_CATEGORIA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
  const HOJE = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmtPct = (v, casas = 1) => `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v)}%`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const num = (v) => Number(v) || 0;

  // ---------- Período ----------
  let periodo = null;       // { inicio: Date, fim: Date }
  let anterior = null;

  // Mesmo dia `meses` atrás; se o mês de lá for mais curto, para no último dia dele (31/03 -> 28/02).
  function mesmoDiaAntes(d, meses) {
    const alvo = new Date(d.getFullYear(), d.getMonth() - meses, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    return new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ultimo));
  }

  // Cada filtro traz o período e com o que ele é comparado:
  //   Este mês    -> os mesmos dias do mês passado (01–14/11 x 01–14/10)
  //   Mês passado -> o mês retrasado inteiro
  //   Este ano    -> o mesmo período do ano passado (sazonalidade: verão com verão)
  //   90 dias     -> os 90 dias logo antes
  //   Personalizado -> veja anteriorDoPersonalizado (mês anterior, ano anterior ou dias logo antes)
  function calcularPeriodo(chave) {
    const ano = HOJE.getFullYear(), mes = HOJE.getMonth();
    switch (chave) {
      case "mes-passado": return { inicio: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 0),
                                   anterior: { inicio: new Date(ano, mes - 2, 1), fim: new Date(ano, mes - 1, 0) } };
      case "90d": return { inicio: somaDias(HOJE, -89), fim: HOJE };
      case "ano": return { inicio: new Date(ano, 0, 1), fim: HOJE,
                           anterior: { inicio: new Date(ano - 1, 0, 1), fim: mesmoDiaAntes(HOJE, 12) } };
      default: return { inicio: new Date(ano, mes, 1), fim: HOJE,
                        anterior: { inicio: new Date(ano, mes - 1, 1), fim: mesmoDiaAntes(HOJE, 1) } };
    }
  }

  function definirPeriodo(p) {
    periodo = { inicio: p.inicio, fim: p.fim };
    if (p.anterior) {
      anterior = p.anterior;
    } else {
      const dias = Math.round((p.fim - p.inicio) / 86400000) + 1;
      const fimA = somaDias(p.inicio, -1);
      anterior = { inicio: somaDias(fimA, -(dias - 1)), fim: fimA };
    }
    painelCache = null;
    el.texto.textContent = `${formatarData(dataParaIso(p.inicio))} a ${formatarData(dataParaIso(p.fim))} · comparado com ${formatarData(dataParaIso(anterior.inicio))} a ${formatarData(dataParaIso(anterior.fim))}`;
  }

  function lerPersonalizado() {
    el.erro.hidden = true;
    if (!el.inicio.value || !el.fim.value) return mostrarErroPeriodo("Informe a data inicial e a final.");
    const [ai, mi, di] = el.inicio.value.split("-").map(Number);
    const [af, mf, df] = el.fim.value.split("-").map(Number);
    const inicio = new Date(ai, mi - 1, di), fim = new Date(af, mf - 1, df);
    if (inicio > fim) return mostrarErroPeriodo("A data inicial não pode ser maior que a final.");
    if ((fim - inicio) / 86400000 > 1800) return mostrarErroPeriodo("O período não pode passar de 5 anos.");
    return { inicio, fim, anterior: anteriorDoPersonalizado(inicio, fim) };
  }

  // Personalizado, no mesmo espírito dos filtros prontos: até 31 dias -> mesmas datas do mês anterior;
  // até 1 ano -> mesmas datas do ano anterior; mais que isso (ou se as datas se sobrepuserem) -> dias logo antes.
  function anteriorDoPersonalizado(inicio, fim) {
    const dias = Math.round((fim - inicio) / 86400000) + 1;
    const meses = dias <= 31 ? 1 : dias <= 366 ? 12 : 0;
    if (!meses) return null;
    const a = { inicio: mesmoDiaAntes(inicio, meses), fim: mesmoDiaAntes(fim, meses) };
    return a.fim < inicio ? a : null;
  }
  function mostrarErroPeriodo(msg) { el.erro.textContent = msg; el.erro.hidden = false; return null; }

  // Vários blocos usam o painel: uma chamada só por período (se falhar, a próxima tentativa busca de novo)
  let painelCache = null;
  function painelDoPeriodo() {
    if (!painelCache) {
      painelCache = dashboardService.painel(periodo.inicio, periodo.fim, anterior.inicio, anterior.fim);
      painelCache.catch(() => { painelCache = null; });
    }
    return painelCache;
  }

  // ---------- Peças de HTML ----------
  const corpoDe = (b) => b.raiz.querySelector("[data-corpo]") || b.raiz;
  const estadoErro = (msg, id) => `<div class="dash-estado dash-estado--erro">${escaparHtml(msg)}<br><button type="button" class="botao-secundario" data-tentar="${id}">Tentar de novo</button></div>`;
  const dinheiro = (v) => escaparHtml(formatarMoeda(v));
  const mini = (itens) => `<div class="dash-mini">${itens.map(([valor, rotulo, classe = ""]) =>
    `<div><strong class="${classe}">${valor}</strong><span>${escaparHtml(rotulo)}</span></div>`).join("")}</div>`;

  // Variação contra o período anterior. `unidade` "p.p." para diferença de percentuais (margem).
  function variacaoHtml(v, { maisEhBom = true, unidade = "%" } = {}) {
    if (v === null || v === undefined) return '<span class="kpi__variacao kpi__variacao--neutro">sem base de comparação</span>';
    if (Math.abs(v) < 0.05) return '<span class="kpi__variacao kpi__variacao--neutro">= estável vs. anterior</span>';
    const subiu = v > 0;
    const texto = unidade === "%" ? fmtPct(Math.abs(v)) : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(v))} ${unidade}`;
    return `<span class="kpi__variacao kpi__variacao--${subiu === maisEhBom ? "bom" : "ruim"}">${subiu ? "▲" : "▼"} ${texto} <span class="kpi__nota-inline">vs. anterior</span></span>`;
  }
  const variacaoPct = (a, b) => (a > 0 ? ((b - a) / a) * 100 : null);

  // ---------- Renderização ----------
  function renderKpis([comp, serie, painel]) {
    const b = comp.b.vendas, a = comp.a.vendas, v = comp.variacao;
    const ticket = (r) => (r.pedidos > 0 ? num(r.receita) / r.pedidos : 0);
    const meses = serie.itens;
    const tendencia = {
      receita: meses.map(m => num(m.receita)),
      margemPct: meses.map(m => num(m.margem_percentual)),
      margem: meses.map(m => num(m.margem_bruta)),
      ticket: meses.map(m => (m.pedidos_venda ? num(m.receita) / m.pedidos_venda : 0))
    };
    const difMargem = b.margem_percentual !== null && a.margem_percentual !== null ? num(b.margem_percentual) - num(a.margem_percentual) : null;
    const cartao = (rotulo, valor, variacao, nota, chaveTendencia = null, negativo = false) => `<article class="kpi">
        <span class="kpi__rotulo">${rotulo}</span><span class="kpi__valor${negativo ? " kpi__valor--negativo" : ""}">${valor}</span>
        ${variacao}<span class="kpi__nota">${nota}</span>${chaveTendencia ? `<div class="kpi__tendencia" data-tendencia="${chaveTendencia}" title="Últimos 6 meses"></div>` : ""}</article>`;
    let html =
      cartao("Receita", dinheiro(b.receita), variacaoHtml(v.receita), escaparHtml(plural(b.pedidos, "pedido confirmado", "pedidos confirmados")), "receita") +
      cartao("Margem bruta", b.margem_percentual === null ? "—" : fmtPct(num(b.margem_percentual)), variacaoHtml(difMargem, { unidade: "p.p." }), "da receita, após o custo do vendido", "margemPct") +
      cartao("Lucro bruto", dinheiro(b.margem_bruta), variacaoHtml(v.margem_bruta), `Resultado do período: ${dinheiro(comp.b.resultado)}`, "margem", num(b.margem_bruta) < 0) +
      cartao("Ticket médio", dinheiro(ticket(b)), variacaoHtml(variacaoPct(ticket(a), ticket(b))), "receita por pedido", "ticket") +
      cartao("Clientes atendidos", String(painel.clientes.atual), variacaoHtml(variacaoPct(painel.clientes.anterior, painel.clientes.atual)),
        escaparHtml(`${painel.clientes.anterior} no período anterior`));
    const r = painel.recebido_em_dia;
    if (r) {
      const p = r.percentual === null ? null : num(r.percentual);
      const classe = p === null ? "" : p >= 85 ? "bom" : p >= 60 ? "atencao" : "critico";
      html += `<article class="kpi"><span class="kpi__rotulo">Recebido em dia</span>
        <span class="kpi__valor">${p === null ? "—" : fmtPct(p, 0)}</span>
        <span class="kpi__nota">${r.total ? escaparHtml(`${r.em_dia} de ${plural(r.total, "título", "títulos")} vencidos no período`) : "nenhum título venceu no período"}</span>
        <div class="medidor" role="img" aria-label="${p === null ? "sem títulos" : fmtPct(p, 0)}"><span class="medidor__barra medidor__barra--${classe}" style="width:${p ?? 0}%"></span></div></article>`;
    }
    el.kpis.innerHTML = html;
    el.kpis.querySelectorAll("[data-tendencia]").forEach(c => graficos.miniLinha(c, tendencia[c.dataset.tendencia], COR.azul));
  }

  function renderVendas(painel, corpo) {
    const lista = (l) => l.map(d => ({ data: d.data, valor: num(d.receita) }));
    graficos.linhaAcumulada(corpo, { atual: lista(painel.vendas_por_dia.atual), anterior: lista(painel.vendas_por_dia.anterior),
      nomeAtual: "Este período", nomeAnterior: "Período anterior", cor: COR.azul });
  }

  // Até 5 fatias: com mais categorias, as menores viram "Outras". A cor segue o NOME (ordem alfabética), não a posição.
  function renderCategorias(painel, corpo) {
    let itens = painel.por_categoria.map(c => ({ rotulo: c.categoria, valor: num(c.receita) }));
    if (itens.length > 5) {
      const resto = itens.slice(4).reduce((s, i) => s + i.valor, 0);
      itens = [...itens.slice(0, 4), { rotulo: "Outras", valor: resto, outras: true }];
    }
    const nomes = itens.filter(i => !i.outras).map(i => i.rotulo).sort((x, y) => x.localeCompare(y, "pt-BR"));
    itens.forEach(i => { i.cor = i.outras ? COR.cinza : CORES_CATEGORIA[nomes.indexOf(i.rotulo)]; });
    const total = itens.reduce((s, i) => s + i.valor, 0);
    const compacto = total >= 1000 ? `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(total / 1000)} mil` : formatarMoeda(total);
    graficos.rosca(corpo, itens, { centro: compacto, subcentro: "no período" });
  }

  function renderProdutos(d, corpo) {
    if (!d.itens.length) { corpo.innerHTML = '<div class="dash-estado">Sem vendas confirmadas no período.</div>'; return; }
    corpo.innerHTML = '<div id="rank-produtos"></div>' + (d.totais.itens_sem_custo > 0
      ? `<p class="dash-nota">${escaparHtml(plural(d.totais.itens_sem_custo, "item vendido está", "itens vendidos estão"))} sem custo cadastrado: a margem real é menor que a mostrada.</p>` : "");
    graficos.barrasHorizontais(corpo.querySelector("#rank-produtos"), d.itens.map(i => ({
      rotulo: i.produto_nome, valor: num(i.receita), texto: formatarMoeda(i.receita), cor: COR.azul,
      detalhe: `${formatarNumero(i.quantidade)} ${i.unidade} · margem ${formatarMoeda(i.margem_bruta)}${i.margem_percentual === null ? "" : ` (${fmtPct(num(i.margem_percentual), 0)})`}`
    })));
  }

  function renderClientes(d, corpo) {
    if (!d.itens.length) { corpo.innerHTML = '<div class="dash-estado">Sem vendas confirmadas no período.</div>'; return; }
    corpo.innerHTML = '<div id="rank-clientes"></div>';
    graficos.barrasHorizontais(corpo.querySelector("#rank-clientes"), d.itens.map(i => ({
      rotulo: i.cliente_nome, valor: num(i.receita), texto: formatarMoeda(i.receita), cor: COR.azul,
      detalhe: `${plural(i.pedidos, "pedido", "pedidos")}${i.participacao_percentual === null ? "" : ` · ${fmtPct(num(i.participacao_percentual))} da receita`}`
    })));
  }

  function renderCaixa(painel, corpo) {
    const c = painel.caixa;
    el.caixaSub.textContent = c.agrupamento === "semana"
      ? "Entradas e saídas por semana, nas 12 semanas até o fim do período"
      : "Entradas e saídas por mês do período";
    const ent = c.itens.reduce((s, i) => s + num(i.entradas), 0), sai = c.itens.reduce((s, i) => s + num(i.saidas), 0);
    corpo.innerHTML = '<div data-grafico></div>';
    graficos.barrasAgrupadas(corpo.querySelector("[data-grafico]"), {
      rotulos: c.itens.map(i => i.rotulo.replace(/\/20(\d\d)$/, "/$1")),
      series: [
        { nome: "Entradas", valores: c.itens.map(i => num(i.entradas)), cor: COR.azul },
        { nome: "Saídas", valores: c.itens.map(i => num(i.saidas)), cor: COR.laranja }
      ],
      rotuloAcessivel: `Caixa realizado: entradas ${formatarMoeda(ent)}, saídas ${formatarMoeda(sai)}`
    });
    corpo.insertAdjacentHTML("beforeend", mini([
      [dinheiro(ent), "entradas"], [dinheiro(sai), "saídas"],
      [dinheiro(ent - sai), "saldo", ent - sai < 0 ? "valor-negativo" : "valor-positivo"]
    ]));
  }

  function renderPrevisto(d, corpo) {
    const atraso = d.em_atraso;
    const temAtraso = num(atraso.a_receber_bruto) > 0 || num(atraso.a_pagar) > 0;
    const rotulos = [...(temAtraso ? ["Vencido"] : []), ...d.itens.map(i => i.rotulo.replace(/\/20(\d\d)$/, "/$1"))];
    corpo.innerHTML = '<div data-grafico></div>';
    graficos.barrasAgrupadas(corpo.querySelector("[data-grafico]"), {
      rotulos,
      series: [
        { nome: "A receber", valores: [...(temAtraso ? [num(atraso.a_receber_bruto)] : []), ...d.itens.map(i => num(i.a_receber_liquido))], cor: COR.azul },
        { nome: "A pagar", valores: [...(temAtraso ? [num(atraso.a_pagar)] : []), ...d.itens.map(i => num(i.a_pagar))], cor: COR.laranja }
      ],
      destacar: (r) => r === "Vencido",
      rotuloAcessivel: "Valores a receber e a pagar por mês de vencimento, com o que já venceu à parte"
    });
    corpo.insertAdjacentHTML("beforeend", mini([
      [dinheiro(d.totais.a_receber_liquido), "a receber (líq.)"], [dinheiro(d.totais.a_pagar), "a pagar"],
      [dinheiro(d.saldo_geral), "saldo projetado", num(d.saldo_geral) < 0 ? "valor-negativo" : "valor-positivo"]
    ]));
  }

  function renderEstoque(painel, corpo) {
    const e = painel.estoque, p = painel.producao;
    corpo.innerHTML = '<div data-grafico></div>' + mini([
      [dinheiro(e.valor_custo), "valor em estoque (custo)"],
      [String(p.ordens), p.ordens === 1 ? "ordem de produção no período" : "ordens de produção no período"],
      [dinheiro(p.custo), "custo produzido"]
    ]);
    graficos.segmentada(corpo.querySelector("[data-grafico]"), [
      { rotulo: "Em dia", valor: e.em_dia, cor: COR.bom },
      { rotulo: "Baixo", valor: e.baixo, cor: COR.atencao },
      { rotulo: "Sem estoque", valor: e.sem_estoque, cor: COR.critico }
    ]);
  }

  // ---------- Produção e receitas (só com producao.ver) ----------
  const detalheItemProducao = (i) => `${formatarNumero(i.quantidade)} ${i.unidade} · ${plural(i.ordens, "ordem", "ordens")}`;

  function renderProducao(painel, corpo) {
    const p = painel.producao, d = painel.producao_detalhe;
    const variacao = variacaoHtml(variacaoPct(num(d.anterior_custo), num(p.custo)));
    const ranking = d.mais_produzidos.length
      ? '<div class="dash-subtitulo">O que mais foi produzido</div><div data-ranking></div>'
      : '<div class="dash-estado">Nenhuma ordem de produção confirmada no período.</div>';
    corpo.innerHTML = ranking + mini([
      [String(p.ordens), p.ordens === 1 ? "ordem confirmada" : "ordens confirmadas"],
      [dinheiro(p.custo), "custo produzido"],
      [String(d.abertas), d.abertas === 1 ? "ordem aguardando confirmação" : "ordens aguardando confirmação", d.abertas ? "valor-atencao" : ""]
    ]) + `<p class="dash-nota">Custo produzido ${variacao} · período anterior: ${escaparHtml(plural(d.anterior_ordens, "ordem", "ordens"))}, ${dinheiro(d.anterior_custo)}.</p>`;
    const alvo = corpo.querySelector("[data-ranking]");
    if (alvo) graficos.barrasHorizontais(alvo, d.mais_produzidos.map(i => ({
      rotulo: i.produto, valor: num(i.custo), texto: formatarMoeda(i.custo), cor: COR.azul, detalhe: detalheItemProducao(i)
    })));
  }

  function renderReceitas(painel, corpo) {
    const r = painel.receitas, d = painel.producao_detalhe;
    const travadas = r.travadas.slice(0, 4).map(t => {
      const f = t.faltas[0];
      const mais = t.faltas.length > 1 ? ` e mais ${t.faltas.length - 1}` : "";
      return `<li><strong>${escaparHtml(t.produto)}</strong><span>falta ${escaparHtml(f.insumo)}: precisa ${escaparHtml(formatarNumero(f.necessario))} ${escaparHtml(f.unidade)}, tem ${escaparHtml(formatarNumero(f.disponivel))}${escaparHtml(mais)}</span></li>`;
    }).join("");
    corpo.innerHTML = `<div data-segmentos></div>
      ${travadas ? `<ul class="dash-travadas">${travadas}</ul>${r.travadas.length > 4 ? `<p class="dash-nota">e mais ${r.travadas.length - 4} receita(s) travada(s).</p>` : ""}` : ""}
      <div class="dash-subtitulo">Insumos mais consumidos no período</div>
      ${d.insumos_mais_consumidos.length ? "<div data-insumos></div>" : '<div class="dash-estado">Nenhum insumo consumido no período.</div>'}
      ${r.sem_receita ? `<p class="dash-nota">${escaparHtml(plural(r.sem_receita, "produto vendável está", "produtos vendáveis estão"))} sem receita: ${escaparHtml(r.sem_receita_nomes.join(", "))}${r.sem_receita > r.sem_receita_nomes.length ? "..." : ""}.</p>` : ""}`;
    graficos.segmentada(corpo.querySelector("[data-segmentos]"), [
      { rotulo: "Prontas para produzir", valor: r.prontas, cor: COR.bom },
      { rotulo: "Com insumo insuficiente", valor: r.travadas.length, cor: COR.atencao }
    ]);
    const alvo = corpo.querySelector("[data-insumos]");
    if (alvo) graficos.barrasHorizontais(alvo, d.insumos_mais_consumidos.map(i => ({
      rotulo: i.produto, valor: num(i.custo), texto: formatarMoeda(i.custo), cor: COR.laranja, detalhe: detalheItemProducao(i)
    })));
  }

  function renderGeladeiras(painel, corpo) {
    const g = painel.geladeiras;
    corpo.innerHTML = '<div data-grafico></div>' + mini([
      [String(g.manutencoes), g.manutencoes === 1 ? "manutenção no período" : "manutenções no período"],
      [dinheiro(g.custo_manutencoes), "gasto com manutenção"],
      [g.manutencoes ? `${g.corretivas} de ${g.manutencoes}` : "—", "corretivas"]
    ]);
    graficos.segmentada(corpo.querySelector("[data-grafico]"), [
      { rotulo: "Em campo", valor: g.em_campo, cor: COR.bom },
      { rotulo: "Em manutenção", valor: g.manutencao, cor: COR.atencao },
      { rotulo: "Desativadas", valor: g.desativada, cor: COR.cinza }
    ]);
  }

  // Cada bloco: raiz (nula = só alimenta os Destaques), como buscar e como desenhar.
  const blocos = [
    { id: "kpis", raiz: el.kpis, dependeDoPeriodo: true,
      carregar: () => Promise.all([
        dashboardService.comparativo(anterior.inicio, anterior.fim, periodo.inicio, periodo.fim),
        dashboardService.serieMensal(new Date(periodo.fim.getFullYear(), periodo.fim.getMonth() - 5, 1), periodo.fim),
        painelDoPeriodo()
      ]),
      render: (d) => renderKpis(d), carregando: () => '<div class="kpi kpi--skeleton"></div>'.repeat(VER_FINANCEIRO ? 6 : 5) },
    { id: "vendas", dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderVendas },
    { id: "categorias", dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderCategorias },
    { id: "produtos", dependeDoPeriodo: true, carregar: () => dashboardService.vendasPorProduto(periodo.inicio, periodo.fim, 5), render: renderProdutos },
    { id: "clientes", dependeDoPeriodo: true, carregar: () => dashboardService.vendasPorCliente(periodo.inicio, periodo.fim, 5), render: renderClientes },
    { id: "caixa", ativo: VER_FINANCEIRO, dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderCaixa },
    { id: "previsto", ativo: VER_FINANCEIRO, dependeDoPeriodo: false, carregar: () => dashboardService.fluxoPrevisto(somaDias(HOJE, 90)), render: renderPrevisto },
    { id: "vencidos", ativo: VER_FINANCEIRO, raiz: null, dependeDoPeriodo: false, carregar: () => dashboardService.vencidos() },
    { id: "estoque", dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderEstoque },
    { id: "geladeiras", ativo: VER_GELADEIRAS, dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderGeladeiras },
    { id: "producao", ativo: VER_PRODUCAO, dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderProducao },
    { id: "receitas", ativo: VER_PRODUCAO, dependeDoPeriodo: true, carregar: painelDoPeriodo, render: renderReceitas }
  ].filter(b => b.ativo !== false);
  blocos.forEach(b => { if (b.raiz === undefined) b.raiz = $(`bloco-${b.id}`); b.token = 0; b.dados = null; b.estado = "novo"; });
  const porId = (id) => blocos.find(b => b.id === id);

  async function carregarBloco(b) {
    const meu = ++b.token;
    b.estado = "carregando";
    const corpo = b.raiz ? corpoDe(b) : null;
    if (corpo) corpo.innerHTML = b.carregando ? b.carregando() : '<div class="dash-estado">Carregando...</div>';
    try {
      const dados = await b.carregar();
      if (meu !== b.token) return;
      b.dados = dados; b.estado = "ok";
      if (corpo) b.render(dados, corpo);
    } catch (erro) {
      if (meu !== b.token) return;
      b.dados = null; b.estado = "erro";
      if (corpo) corpo.innerHTML = estadoErro(erro.message || "Não foi possível carregar.", b.id);
    }
    atualizarDestaques();
  }

  // ---------- Destaques ----------
  function atualizarDestaques() {
    const itens = [];
    const add = (tom, html) => itens.push({ tom, html });
    const d = (id) => (porId(id) ? porId(id).dados : null);

    const k = d("kpis");
    if (k) {
      const [{ b, variacao: v }, , painel] = k;
      if (b.vendas.pedidos === 0) add("info", "Não há vendas confirmadas neste período.");
      else if (v.receita === null) add("info", `A receita foi de <strong>${dinheiro(b.vendas.receita)}</strong>; o período anterior não teve vendas para comparar.`);
      else if (Math.abs(v.receita) < 0.05) add("info", `A receita ficou estável em <strong>${dinheiro(b.vendas.receita)}</strong> em relação ao período anterior.`);
      else add(v.receita > 0 ? "bom" : "alerta", `A receita de <strong>${dinheiro(b.vendas.receita)}</strong> ficou <strong>${fmtPct(Math.abs(v.receita))} ${v.receita > 0 ? "acima" : "abaixo"}</strong> do período anterior.`);
      if (num(b.resultado) < 0) add("risco", `O período está com <strong>resultado negativo de ${dinheiro(Math.abs(num(b.resultado)))}</strong>: despesas maiores que a margem.`);
      if (b.vendas.itens_sem_custo > 0) add("alerta", `${escaparHtml(plural(b.vendas.itens_sem_custo, "item vendido está", "itens vendidos estão"))} sem custo cadastrado: a margem está superestimada.`);
      const r = painel.recebido_em_dia;
      if (r && r.percentual !== null && num(r.percentual) < 60) add("alerta", `Só <strong>${fmtPct(num(r.percentual), 0)}</strong> dos títulos a receber do período foram pagos até o vencimento.`);
    }
    const cl = d("clientes");
    if (cl && cl.clientes_no_periodo > 1 && cl.itens[0] && cl.itens[0].participacao_percentual >= 50) {
      add("alerta", `<strong>${escaparHtml(cl.itens[0].cliente_nome)}</strong> concentra ${fmtPct(cl.itens[0].participacao_percentual)} da receita: dependência alta de um só cliente.`);
    }
    const pr = d("produtos");
    if (pr) {
      const fraco = pr.itens.filter(i => i.margem_percentual !== null && i.margem_percentual < 20).sort((x, y) => x.margem_percentual - y.margem_percentual)[0];
      if (fraco) add("alerta", `<strong>${escaparHtml(fraco.produto_nome)}</strong> vende bem, mas com margem de só ${fmtPct(fraco.margem_percentual)}. Vale revisar o preço.`);
    }
    const ve = d("vencidos");
    if (ve) {
      if (ve.receber && ve.receber.quantidade > 0) {
        const dias = Math.max(...ve.receber.partes.map(x => x.maior_atraso_dias), 0);
        add("risco", `${escaparHtml(plural(ve.receber.quantidade, "título a receber vencido soma", "títulos a receber vencidos somam"))} <strong>${dinheiro(ve.receber.saldo)}</strong>; o mais antigo está há ${dias} ${dias === 1 ? "dia" : "dias"} em atraso.`);
      }
      if (ve.pagar && ve.pagar.quantidade > 0) add("alerta", `Há <strong>${dinheiro(ve.pagar.saldo)}</strong> em contas a pagar vencidas (${escaparHtml(plural(ve.pagar.quantidade, "título", "títulos"))}). <a href="financeiro.html">Ver financeiro</a>`);
    }
    const pv = d("previsto");
    if (pv) {
      if (num(pv.saldo_geral) < 0) add("risco", `A previsão para os próximos 90 dias é <strong>negativa em ${dinheiro(Math.abs(num(pv.saldo_geral)))}</strong>: o que há a pagar supera o a receber.`);
      else if (num(pv.totais.a_pagar) > 0 || num(pv.totais.a_receber_liquido) > 0) add("bom", `Previsão de caixa positiva nos próximos 90 dias: <strong>${dinheiro(pv.saldo_geral)}</strong>.`);
    }
    const es = d("estoque");
    if (es) {
      const abaixo = es.estoque.baixo + es.estoque.sem_estoque;
      if (abaixo > 0) add("alerta", `${escaparHtml(plural(abaixo, "produto está", "produtos estão"))} abaixo do estoque mínimo${es.estoque.sem_estoque ? ` (${es.estoque.sem_estoque} sem nada disponível)` : ""}. <a href="produtos.html">Ver produtos</a>`);
    }
    const ge = d("geladeiras");
    if (ge && ge.geladeiras.manutencao > 0) add("info", `${escaparHtml(plural(ge.geladeiras.manutencao, "geladeira está", "geladeiras estão"))} em manutenção. <a href="geladeiras.html">Ver geladeiras</a>`);
    const pr2 = d("receitas");
    if (pr2 && pr2.receitas) {
      const t = pr2.receitas.travadas.length;
      if (t > 0) add("alerta", `${escaparHtml(plural(t, "receita não pode", "receitas não podem"))} ser produzida${t === 1 ? "" : "s"} por falta de insumo. <a href="producao.html?aba=receitas">Ver receitas</a>`);
      if (pr2.producao_detalhe.abertas > 0) add("info", `${escaparHtml(plural(pr2.producao_detalhe.abertas, "ordem de produção está", "ordens de produção estão"))} aberta${pr2.producao_detalhe.abertas === 1 ? "" : "s"}, aguardando confirmação. <a href="producao.html">Ver produção</a>`);
      if (pr2.receitas.sem_receita > 0) add("info", `${escaparHtml(plural(pr2.receitas.sem_receita, "produto vendável está", "produtos vendáveis estão"))} sem receita cadastrada.`);
    }

    const ordem = { risco: 0, alerta: 1, bom: 2, info: 3 };
    itens.sort((x, y) => ordem[x.tom] - ordem[y.tom]);
    const carregando = blocos.some(b => b.estado === "carregando" || b.estado === "novo");
    if (!itens.length) add("info", carregando ? "Carregando..." : "Nada fora do normal neste período.");
    el.destaques.innerHTML = itens.map(i => `<li class="destaque destaque--${i.tom}"><span>${i.html}</span></li>`).join("");
  }

  // ---------- Eventos ----------
  function aplicarPeriodo(p, soPeriodo = true) {
    definirPeriodo(p);
    blocos.filter(b => !soPeriodo || b.dependeDoPeriodo).forEach(carregarBloco);
  }

  el.select.addEventListener("change", () => {
    const personalizado = el.select.value === "custom";
    el.custom.hidden = !personalizado;
    el.erro.hidden = true;
    try { localStorage.setItem("nova_sorvetes_dash_periodo", el.select.value === "custom" ? "mes" : el.select.value); } catch (_) { /* opcional */ }
    if (personalizado) {
      el.inicio.value = dataParaIso(periodo.inicio);
      el.fim.value = dataParaIso(periodo.fim);
      el.inicio.focus();
      return;
    }
    aplicarPeriodo(calcularPeriodo(el.select.value));
  });

  el.aplicar.addEventListener("click", () => {
    const p = lerPersonalizado();
    if (p) aplicarPeriodo(p);
  });

  document.querySelector(".conteudo-principal").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-tentar]");
    if (botao) carregarBloco(porId(botao.dataset.tentar));
  });

  // ---------- Início ----------
  let inicial = "mes";
  try {
    const salvo = localStorage.getItem("nova_sorvetes_dash_periodo");
    if (["mes", "mes-passado", "90d", "ano"].includes(salvo)) inicial = salvo;
  } catch (_) { /* sem armazenamento: usa o padrão */ }
  el.select.value = inicial;
  atualizarDestaques();
  aplicarPeriodo(calcularPeriodo(inicial), false);
});
