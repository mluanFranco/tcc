// Dashboard: números do período (KPIs com variação), evolução, caixa, previsão, inadimplência, rankings e estoque baixo.
// Cada bloco carrega e falha sozinho (com "Tentar de novo"); trocar o período recarrega só os blocos que dependem dele.
// Os "Destaques" são frases geradas a partir dos números já carregados (sem chamar nenhuma IA).
// Dependências: auth.js, formatadores.js, graficos.js, dashboardService.js.

document.addEventListener("DOMContentLoaded", () => {
  if (!exigirPermissao("relatorios.ver")) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    select: $("periodo-select"), custom: $("periodo-custom"), inicio: $("data-inicio"), fim: $("data-fim"), aplicar: $("periodo-aplicar"),
    texto: $("periodo-texto"), erro: $("erro-periodo"), destaques: $("destaques-lista"), kpis: $("bloco-kpis"), linkFinanceiro: $("link-financeiro")
  };

  const COR = { receita: "#0F59FD", margem: "#14B8A6", resultado: "#F59E0B", negativo: "#DC2626", pagar: "#F59E0B" };
  const HOJE = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const pct = (v) => `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const num = (v) => Number(v) || 0;

  if (temPermissao("financeiro.ver")) el.linkFinanceiro.hidden = false;

  // ---------- Período ----------
  let periodo = null;       // { inicio: Date, fim: Date }
  let anterior = null;

  function calcularPeriodo(chave) {
    switch (chave) {
      case "mes-passado": return { inicio: new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1), fim: new Date(HOJE.getFullYear(), HOJE.getMonth(), 0) };
      case "90d": return { inicio: somaDias(HOJE, -89), fim: HOJE };
      case "ano": return { inicio: new Date(HOJE.getFullYear(), 0, 1), fim: HOJE };
      default: return { inicio: new Date(HOJE.getFullYear(), HOJE.getMonth(), 1), fim: HOJE };
    }
  }

  function definirPeriodo(p) {
    periodo = p;
    const dias = Math.round((p.fim - p.inicio) / 86400000) + 1;
    const fimA = somaDias(p.inicio, -1);
    anterior = { inicio: somaDias(fimA, -(dias - 1)), fim: fimA };
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
    return { inicio, fim };
  }
  function mostrarErroPeriodo(msg) { el.erro.textContent = msg; el.erro.hidden = false; return null; }

  // ---------- Blocos ----------
  const corpoDe = (b) => b.raiz.querySelector("[data-corpo]") || b.raiz;
  const estadoErro = (msg, id) => `<div class="dash-estado dash-estado--erro">${escaparHtml(msg)}<br><button type="button" class="botao-secundario" data-tentar="${id}">Tentar de novo</button></div>`;
  const linha = (rotulo, valor, classe = "", extra = "") => `<div class="dash-linha ${extra}"><span class="dash-linha__rotulo">${escaparHtml(rotulo)}</span><span class="dash-linha__valor ${classe}">${valor}</span></div>`;
  const classeSinal = (v) => (v > 0 ? "valor-positivo" : v < 0 ? "valor-negativo" : "");
  const dinheiro = (v) => escaparHtml(formatarMoeda(v));

  function variacaoHtml(v, maisEhBom = true) {
    if (v === null || v === undefined) return '<span class="kpi__variacao kpi__variacao--neutro">sem base de comparação</span>';
    if (Math.abs(v) < 0.05) return '<span class="kpi__variacao kpi__variacao--neutro">= estável vs. período anterior</span>';
    const subiu = v > 0;
    const bom = subiu === maisEhBom;
    return `<span class="kpi__variacao kpi__variacao--${bom ? "bom" : "ruim"}">${subiu ? "▲" : "▼"} ${pct(Math.abs(v))} <span class="kpi__sub">vs. anterior</span></span>`;
  }

  function renderKpis(d) {
    const b = d.b, a = d.a, v = d.variacao;
    const ticket = (r) => (r.vendas.pedidos > 0 ? r.vendas.receita / r.vendas.pedidos : 0);
    const tB = ticket(b), tA = ticket(a);
    const vTicket = tA > 0 ? ((tB - tA) / tA) * 100 : null;
    const card = (rotulo, valor, sub, variacao, negativo = false) => `<article class="kpi"><span class="kpi__rotulo">${rotulo}</span>
      <span class="kpi__valor${negativo ? " kpi__valor--negativo" : ""}">${valor}</span>${variacao}<span class="kpi__sub">${sub}</span></article>`;
    el.kpis.innerHTML =
      card("Receita", dinheiro(b.vendas.receita), escaparHtml(plural(b.vendas.pedidos, "pedido confirmado", "pedidos confirmados")), variacaoHtml(v.receita)) +
      card("Margem bruta", dinheiro(b.vendas.margem_bruta), b.vendas.margem_percentual === null ? "sem vendas" : `${pct(b.vendas.margem_percentual)} da receita`, variacaoHtml(v.margem_bruta)) +
      card("Ticket médio", dinheiro(tB), "receita por pedido", variacaoHtml(vTicket)) +
      card("Despesas", dinheiro(b.despesas), `Compras de estoque: ${dinheiro(b.compras.total)}`, variacaoHtml(v.despesas, false)) +
      card("Resultado", dinheiro(b.resultado), "margem + outras receitas − despesas", variacaoHtml(v.resultado), b.resultado < 0);
  }

  function renderSerie(d, corpo) {
    const rotulos = d.itens.map(i => i.rotulo.replace(/\/20(\d\d)$/, "/$1"));
    graficos.barrasAgrupadas(corpo, {
      rotulos,
      series: [
        { nome: "Receita", valores: d.itens.map(i => num(i.receita)), cor: COR.receita },
        { nome: "Margem bruta", valores: d.itens.map(i => num(i.margem_bruta)), cor: COR.margem },
        { nome: "Resultado", valores: d.itens.map(i => num(i.resultado)), cor: COR.resultado, corNegativa: COR.negativo }
      ],
      rotuloAcessivel: `Receita, margem bruta e resultado por mês: ${d.itens.map(i => `${i.rotulo} receita ${formatarMoeda(i.receita)}, resultado ${formatarMoeda(i.resultado)}`).join("; ")}`
    });
  }

  function renderCaixa(d, corpo) {
    const t = d.totais;
    if (!t.baixas_entrada && !t.baixas_saida) { corpo.innerHTML = '<div class="dash-estado">Nenhum pagamento ou recebimento no período.</div>'; return; }
    corpo.innerHTML = `<div class="dash-linhas">
      ${linha("Recebido dos clientes", dinheiro(t.entradas_bruto))}
      ${linha("Taxas estimadas", `− ${dinheiro(t.taxa_estimada)}`)}
      ${linha("Entradas líquidas", dinheiro(t.entradas_liquido))}
      ${linha("Pago (fornecedores e despesas)", `− ${dinheiro(t.saidas)}`)}
      ${linha("Saldo do período", dinheiro(t.saldo), classeSinal(num(t.saldo)), "dash-linha--total")}
    </div><div class="hbarras" id="caixa-barras"></div>
    <p class="dash-nota">Regime de caixa: conta pela data em que o dinheiro entrou ou saiu.</p>`;
    graficos.barrasHorizontais(corpo.querySelector("#caixa-barras"), [
      { rotulo: "Entradas líquidas", valor: num(t.entradas_liquido), texto: formatarMoeda(t.entradas_liquido), cor: COR.margem },
      { rotulo: "Saídas", valor: num(t.saidas), texto: formatarMoeda(t.saidas), cor: COR.pagar }
    ]);
  }

  function renderPrevisto(d, corpo) {
    const atraso = d.em_atraso, t = d.totais;
    corpo.innerHTML = `<div class="dash-linhas">
      ${linha("A receber (líquido de taxas)", dinheiro(t.a_receber_liquido))}
      ${linha("A pagar", `− ${dinheiro(t.a_pagar)}`)}
      ${linha("Já vencido a receber", dinheiro(atraso.a_receber_bruto), num(atraso.a_receber_bruto) > 0 ? "valor-negativo" : "")}
      ${linha("Já vencido a pagar", `− ${dinheiro(atraso.a_pagar)}`, num(atraso.a_pagar) > 0 ? "valor-negativo" : "")}
      ${linha("Saldo projetado", dinheiro(d.saldo_geral), classeSinal(num(d.saldo_geral)), "dash-linha--total")}
    </div><div class="dash-subtitulo">Por mês de vencimento</div><div id="previsto-grafico"></div>
    <p class="dash-nota">De hoje até ${escaparHtml(formatarData(d.periodo.fim))}, mais o que já venceu e continua em aberto.</p>`;
    graficos.barrasAgrupadas(corpo.querySelector("#previsto-grafico"), {
      rotulos: d.itens.map(i => i.rotulo.replace(/\/20(\d\d)$/, "/$1")),
      series: [
        { nome: "A receber (líq.)", valores: d.itens.map(i => num(i.a_receber_liquido)), cor: COR.receita },
        { nome: "A pagar", valores: d.itens.map(i => num(i.a_pagar)), cor: COR.pagar }
      ],
      rotuloAcessivel: "Valores a receber e a pagar por mês de vencimento"
    });
  }

  const CORES_FAIXA = ["#F59E0B", "#F97316", "#EF4444", "#B91C1C"];
  function renderVencidos(d, corpo) {
    const r = d.receber, p = d.pagar;
    const nada = (!r || r.quantidade === 0);
    let html = "";
    if (nada) {
      html += '<div class="dash-estado">Nenhum título a receber vencido.</div>';
    } else {
      html += `<div class="dash-linhas">${linha("Total vencido a receber", dinheiro(r.saldo), "valor-negativo", "dash-linha--total")}</div><div class="hbarras" id="faixas-barras"></div>
        <div class="dash-subtitulo">Maiores saldos</div><div class="dash-linhas">${r.partes.slice(0, 3).map(x =>
          linha(`${x.parte_nome} · ${x.maior_atraso_dias} ${x.maior_atraso_dias === 1 ? "dia" : "dias"} de atraso`, dinheiro(x.saldo))).join("")}</div>`;
    }
    if (p && p.quantidade > 0) html += `<p class="dash-nota">Contas a pagar vencidas: <strong>${dinheiro(p.saldo)}</strong> em ${escaparHtml(plural(p.quantidade, "título", "títulos"))}.</p>`;
    corpo.innerHTML = html;
    if (!nada) {
      graficos.barrasHorizontais(corpo.querySelector("#faixas-barras"), r.faixas.map((f, i) => ({
        rotulo: `${f.faixa} dias`, valor: num(f.saldo), texto: formatarMoeda(f.saldo), detalhe: plural(f.quantidade, "título", "títulos"), cor: CORES_FAIXA[i] || CORES_FAIXA[3]
      })));
    }
  }

  function renderProdutos(d, corpo) {
    if (!d.itens.length) { corpo.innerHTML = '<div class="dash-estado">Sem vendas confirmadas no período.</div>'; return; }
    corpo.innerHTML = '<div id="rank-produtos"></div>' + (d.totais.itens_sem_custo > 0
      ? `<p class="dash-nota">${escaparHtml(plural(d.totais.itens_sem_custo, "item vendido está", "itens vendidos estão"))} sem custo cadastrado: a margem real é menor que a mostrada.</p>` : "");
    graficos.barrasHorizontais(corpo.querySelector("#rank-produtos"), d.itens.map(i => ({
      rotulo: i.produto_nome, valor: num(i.receita), texto: formatarMoeda(i.receita),
      detalhe: `${formatarNumero(i.quantidade)} ${i.unidade} · margem ${i.margem_percentual === null ? "—" : pct(i.margem_percentual)}`
    })));
  }

  function renderClientes(d, corpo) {
    if (!d.itens.length) { corpo.innerHTML = '<div class="dash-estado">Sem vendas confirmadas no período.</div>'; return; }
    corpo.innerHTML = '<div id="rank-clientes"></div>';
    graficos.barrasHorizontais(corpo.querySelector("#rank-clientes"), d.itens.map(i => ({
      rotulo: i.cliente_nome, valor: num(i.receita), texto: formatarMoeda(i.receita),
      detalhe: `${plural(i.pedidos, "pedido", "pedidos")} · ticket ${formatarMoeda(i.ticket_medio)}${i.participacao_percentual === null ? "" : ` · ${pct(i.participacao_percentual)} da receita`}`
    })));
  }

  function renderFormas(d, corpo) {
    if (!d.itens.length) { corpo.innerHTML = '<div class="dash-estado">Sem vendas confirmadas no período.</div>'; return; }
    corpo.innerHTML = '<div id="rank-formas"></div>';
    graficos.barrasHorizontais(corpo.querySelector("#rank-formas"), d.itens.map(i => ({
      rotulo: i.forma_pagamento, valor: num(i.total), texto: `${formatarMoeda(i.total)}${i.participacao_percentual === null ? "" : ` (${pct(i.participacao_percentual)})`}`,
      detalhe: `${i.prazo_medio_dias === null ? "prazo —" : `prazo médio ${formatarNumero(i.prazo_medio_dias)} dias`} · taxa estimada ${formatarMoeda(i.taxa_estimada || 0)}`
    })));
    if (d.totais.prazo_medio_dias !== null) corpo.insertAdjacentHTML("beforeend", `<p class="dash-nota">Prazo médio geral: <strong>${escaparHtml(formatarNumero(d.totais.prazo_medio_dias))} dias</strong> · taxas estimadas: <strong>${dinheiro(d.totais.taxa_estimada || 0)}</strong>.</p>`);
  }

  function renderEstoque(lista, corpo) {
    if (!lista.length) { corpo.innerHTML = '<div class="dash-estado">Nenhum produto abaixo do estoque mínimo.</div>'; return; }
    const razao = (p) => (num(p.estoque_minimo) > 0 ? num(p.estoque_atual) / num(p.estoque_minimo) : 0);
    const ordenados = [...lista].sort((x, y) => razao(x) - razao(y) || x.nome.localeCompare(y.nome, "pt-BR"));
    const itens = ordenados.slice(0, 5).map(p => `<li class="estoque-item"><span class="estoque-item__nome">${escaparHtml(p.nome)}</span>
      <span class="estoque-item__qtd${num(p.estoque_atual) <= 0 ? " estoque-item__qtd--zero" : ""}">${escaparHtml(formatarNumero(p.estoque_atual))} de ${escaparHtml(formatarNumero(p.estoque_minimo))}</span></li>`).join("");
    corpo.innerHTML = `<ul class="estoque-lista">${itens}</ul>` + (lista.length > 5 ? `<p class="dash-nota">e mais ${lista.length - 5} ${lista.length - 5 === 1 ? "produto" : "produtos"} abaixo do mínimo.</p>` : "");
  }

  // Cada bloco: raiz, como buscar e como desenhar. `dependeDoPeriodo` decide se recarrega ao trocar o filtro.
  const blocos = [
    { id: "kpis", raiz: el.kpis, dependeDoPeriodo: true, carregar: async () => {
        const r = await dashboardService.comparativo(anterior.inicio, anterior.fim, periodo.inicio, periodo.fim);
        return r; }, render: (d) => renderKpis(d), carregando: () => '<div class="kpi kpi--skeleton"></div>'.repeat(5) },
    { id: "serie", dependeDoPeriodo: true, carregar: () => dashboardService.serieMensal(new Date(periodo.fim.getFullYear(), periodo.fim.getMonth() - 5, 1), periodo.fim), render: renderSerie },
    { id: "caixa", dependeDoPeriodo: true, carregar: () => dashboardService.fluxoCaixa(periodo.inicio, periodo.fim), render: renderCaixa },
    { id: "previsto", dependeDoPeriodo: false, carregar: () => dashboardService.fluxoPrevisto(somaDias(HOJE, 90)), render: renderPrevisto },
    { id: "vencidos", dependeDoPeriodo: false, carregar: () => dashboardService.vencidos(), render: renderVencidos },
    { id: "produtos", dependeDoPeriodo: true, carregar: () => dashboardService.vendasPorProduto(periodo.inicio, periodo.fim, 5), render: renderProdutos },
    { id: "clientes", dependeDoPeriodo: true, carregar: () => dashboardService.vendasPorCliente(periodo.inicio, periodo.fim, 5), render: renderClientes },
    { id: "formas", dependeDoPeriodo: true, carregar: () => dashboardService.formasDePagamentoVenda(periodo.inicio, periodo.fim), render: renderFormas },
    { id: "estoque", dependeDoPeriodo: false, carregar: () => dashboardService.estoqueBaixo(), render: renderEstoque }
  ];
  blocos.forEach(b => { b.raiz = b.raiz || $(`bloco-${b.id}`); b.token = 0; b.dados = null; b.estado = "novo"; });
  const porId = (id) => blocos.find(b => b.id === id);

  async function carregarBloco(b) {
    const meu = ++b.token;
    b.estado = "carregando";
    const corpo = corpoDe(b);
    corpo.innerHTML = b.carregando ? b.carregando() : '<div class="dash-estado">Carregando...</div>';
    try {
      const dados = await b.carregar();
      if (meu !== b.token) return;
      b.dados = dados; b.estado = "ok";
      b.render(dados, corpo);
    } catch (erro) {
      if (meu !== b.token) return;
      b.dados = null; b.estado = "erro";
      corpo.innerHTML = estadoErro(erro.message || "Não foi possível carregar.", b.id);
    }
    atualizarDestaques();
  }

  // ---------- Destaques ----------
  function atualizarDestaques() {
    const itens = [];
    const add = (tom, html) => itens.push({ tom, html });
    const d = (id) => porId(id).dados;

    const k = d("kpis");
    if (k) {
      const { b, variacao: v } = k;
      if (b.vendas.pedidos === 0) add("info", "Não há vendas confirmadas neste período.");
      else if (v.receita === null) add("info", `A receita foi de <strong>${dinheiro(b.vendas.receita)}</strong>; o período anterior não teve vendas para comparar.`);
      else if (Math.abs(v.receita) < 0.05) add("info", `A receita ficou estável em <strong>${dinheiro(b.vendas.receita)}</strong> em relação ao período anterior.`);
      else add(v.receita > 0 ? "bom" : "alerta", `A receita de <strong>${dinheiro(b.vendas.receita)}</strong> ficou <strong>${pct(Math.abs(v.receita))} ${v.receita > 0 ? "acima" : "abaixo"}</strong> do período anterior.`);
      if (num(b.resultado) < 0) add("risco", `O período está com <strong>resultado negativo de ${dinheiro(Math.abs(num(b.resultado)))}</strong>: despesas maiores que a margem.`);
      if (b.vendas.itens_sem_custo > 0) add("alerta", `${escaparHtml(plural(b.vendas.itens_sem_custo, "item vendido está", "itens vendidos estão"))} sem custo cadastrado: a margem está superestimada.`);
    }
    const cl = d("clientes");
    if (cl && cl.clientes_no_periodo > 1 && cl.itens[0] && cl.itens[0].participacao_percentual >= 50) {
      add("alerta", `<strong>${escaparHtml(cl.itens[0].cliente_nome)}</strong> concentra ${pct(cl.itens[0].participacao_percentual)} da receita: dependência alta de um só cliente.`);
    }
    const pr = d("produtos");
    if (pr) {
      const fraco = pr.itens.filter(i => i.margem_percentual !== null && i.margem_percentual < 20).sort((x, y) => x.margem_percentual - y.margem_percentual)[0];
      if (fraco) add("alerta", `<strong>${escaparHtml(fraco.produto_nome)}</strong> vende bem, mas com margem de só ${pct(fraco.margem_percentual)}. Vale revisar o preço.`);
    }
    const ve = d("vencidos");
    if (ve) {
      if (ve.receber && ve.receber.quantidade > 0) {
        const dias = Math.max(...ve.receber.partes.map(x => x.maior_atraso_dias), 0);
        add("risco", `${escaparHtml(plural(ve.receber.quantidade, "título a receber vencido soma", "títulos a receber vencidos somam"))} <strong>${dinheiro(ve.receber.saldo)}</strong>; o mais antigo está há ${dias} ${dias === 1 ? "dia" : "dias"} em atraso.`);
      }
      if (ve.pagar && ve.pagar.quantidade > 0) add("alerta", `Há <strong>${dinheiro(ve.pagar.saldo)}</strong> em contas a pagar vencidas (${escaparHtml(plural(ve.pagar.quantidade, "título", "títulos"))}).`);
    }
    const pv = d("previsto");
    if (pv) {
      if (num(pv.saldo_geral) < 0) add("risco", `A previsão para os próximos 90 dias é <strong>negativa em ${dinheiro(Math.abs(num(pv.saldo_geral)))}</strong>: o que há a pagar supera o a receber.`);
      else if (num(pv.totais.a_pagar) > 0 || num(pv.totais.a_receber_liquido) > 0) add("bom", `Previsão de caixa positiva nos próximos 90 dias: <strong>${dinheiro(pv.saldo_geral)}</strong>.`);
    }
    const es = d("estoque");
    if (es && es.length > 0) add("alerta", `${escaparHtml(plural(es.length, "produto está", "produtos estão"))} abaixo do estoque mínimo. <a href="produtos.html">Ver produtos</a>`);

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
