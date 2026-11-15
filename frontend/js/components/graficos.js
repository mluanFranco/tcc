// Gráficos do Dashboard feitos à mão (SVG + CSS), sem biblioteca externa (funcionam sem internet).
//   graficos.barrasAgrupadas(container, { rotulos, series: [{ nome, valores, cor }], rotuloAcessivel, destacar })
//   graficos.barrasHorizontais(container, [{ rotulo, valor, texto, detalhe, cor }], { maximo })
//   graficos.linhaAcumulada(container, { atual: [{ data, valor }], anterior: [...], nomeAtual, nomeAnterior })
//   graficos.rosca(container, [{ rotulo, valor, cor }], { centro, subcentro })
//   graficos.miniLinha(container, valores, cor)
//   graficos.segmentada(container, [{ rotulo, valor, cor }])
// Todos mostram o valor ao passar o mouse e redesenham quando a janela muda de largura.
// Depende de formatadores.js (escaparHtml, formatarMoeda, formatarData).

const graficos = (() => {
  const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const eixo = (v) => (v === 0 ? "0" : compacto.format(v));
  const pct = (v) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v)}%`;

  // Escala "bonita": passo de 1, 2 ou 5 x 10^n, sempre incluindo o zero.
  function escala(minimo, maximo, divisoes = 4) {
    const topo = Math.max(maximo, 0);
    const base = Math.min(minimo, 0);
    const amplitude = (topo - base) || 1;
    const bruto = amplitude / divisoes;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / pot;
    const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
    const min = Math.floor(base / passo) * passo;
    const max = Math.ceil(topo / passo) * passo || passo;
    const marcas = [];
    for (let v = min; v <= max + passo / 2; v += passo) marcas.push(Math.round(v / passo) * passo);
    return { min, max, marcas };
  }

  // Redesenha ao redimensionar (a largura do SVG acompanha o contêiner, então o texto fica sempre no tamanho real).
  const registrados = new Map();   // container -> { redesenhar, largura }
  let temporizador = null;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      registrados.forEach((r, container) => {
        if (!container.isConnected) { registrados.delete(container); return; }
        if (Math.abs(container.clientWidth - r.largura) > 8) r.redesenhar();
      });
    }, 150);
  });
  const registrar = (container, redesenhar) => registrados.set(container, { redesenhar, largura: container.clientWidth });

  // Dica (tooltip): qualquer elemento com data-dica dentro de .grafico__area
  function ligarDica(container) {
    const area = container.querySelector(".grafico__area");
    const dica = container.querySelector(".grafico__dica");
    if (!area || !dica) return;
    const mostrar = (texto, e) => {
      const caixa = area.getBoundingClientRect();
      dica.textContent = texto;
      dica.hidden = false;
      const x = Math.min(e.clientX - caixa.left + 12, caixa.width - dica.offsetWidth - 4);
      dica.style.left = `${Math.max(0, x)}px`;
      dica.style.top = `${Math.max(0, e.clientY - caixa.top - 40)}px`;
    };
    area.addEventListener("mousemove", (e) => {
      if (area._dicaDinamica) { const t = area._dicaDinamica(e); if (t) { mostrar(t, e); return; } }
      const alvo = e.target.closest("[data-dica]");
      if (!alvo) { dica.hidden = true; return; }
      mostrar(alvo.dataset.dica, e);
    });
    area.addEventListener("mouseleave", () => { dica.hidden = true; if (area._aoSair) area._aoSair(); });
  }

  const legendaHtml = (series) => `<div class="grafico__legenda">${series.map(s =>
    `<span><i class="${s.tracejado ? "grafico__legenda-tracejado" : ""}" style="${s.tracejado ? "" : `background:${s.cor}`}"></i>${escaparHtml(s.nome)}</span>`).join("")}</div>`;

  // ---------------------------------------------------------------- colunas agrupadas
  function barrasAgrupadas(container, dados) {
    const { rotulos, series, rotuloAcessivel = "", destacar = null } = dados;
    registrar(container, () => barrasAgrupadas(container, dados));
    const todos = series.flatMap(s => s.valores);
    if (rotulos.length === 0 || todos.every(v => v === 0)) {
      container.innerHTML = '<p class="grafico-vazio">Sem movimento neste período.</p>';
      return;
    }
    const W = Math.max(container.clientWidth, 260), H = 230, ML = 54, MR = 8, MT = 10, MB = 28;
    const { min, max, marcas } = escala(Math.min(...todos), Math.max(...todos));
    const y = (v) => MT + (H - MT - MB) * (1 - (v - min) / (max - min));
    const largGrupo = (W - ML - MR) / rotulos.length;
    const largBarra = Math.min(22, (largGrupo * 0.72) / series.length);
    const grade = marcas.map(m => `<line class="grafico__grade${m === 0 ? " grafico__grade--zero" : ""}" x1="${ML}" x2="${W - MR}" y1="${y(m)}" y2="${y(m)}"/>
      <text class="grafico__eixo" x="${ML - 8}" y="${y(m) + 4}" text-anchor="end">${escaparHtml(eixo(m))}</text>`).join("");
    const barras = rotulos.map((rotulo, i) => {
      const x0 = ML + largGrupo * i + (largGrupo - largBarra * series.length) / 2;
      const grupo = series.map((s, j) => {
        const v = s.valores[i];
        const alt = Math.max(Math.abs(y(v) - y(0)), v === 0 ? 0 : 1.5);
        const cor = v < 0 && s.corNegativa ? s.corNegativa : s.cor;
        const x = x0 + largBarra * j, w = largBarra - 2, r = Math.min(4, alt, w / 2);
        const topoY = Math.min(y(v), y(0));
        // ponta arredondada só do lado do dado; a base fica reta na linha do zero
        const d = v >= 0
          ? `M${x},${topoY + alt} V${topoY + r} Q${x},${topoY} ${x + r},${topoY} H${x + w - r} Q${x + w},${topoY} ${x + w},${topoY + r} V${topoY + alt}Z`
          : `M${x},${topoY} V${topoY + alt - r} Q${x},${topoY + alt} ${x + r},${topoY + alt} H${x + w - r} Q${x + w},${topoY + alt} ${x + w},${topoY + alt - r} V${topoY}Z`;
        return `<path class="grafico__barra" d="${d}" fill="${cor}" data-dica="${escaparHtml(`${rotulo} · ${s.nome}: ${formatarMoeda(v)}`)}"/>`;
      }).join("");
      const destaque = destacar && destacar(rotulo);
      return grupo + `<text class="grafico__eixo${destaque ? " grafico__eixo--destaque" : ""}" x="${ML + largGrupo * (i + 0.5)}" y="${H - 8}" text-anchor="middle">${escaparHtml(rotulo)}</text>`;
    }).join("");
    container.innerHTML = `${series.length > 1 ? legendaHtml(series) : ""}<div class="grafico__area">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escaparHtml(rotuloAcessivel)}">${grade}${barras}</svg>
      <div class="grafico__dica" hidden></div></div>`;
    ligarDica(container);
  }

  // ---------------------------------------------------------------- barras horizontais (rankings)
  function barrasHorizontais(container, itens, { maximo = null } = {}) {
    if (!itens.length) { container.innerHTML = ""; return; }
    const teto = maximo ?? Math.max(...itens.map(i => Math.abs(i.valor)), 1);
    container.innerHTML = itens.map(i => {
      const largura = Math.max(Math.min(Math.abs(i.valor) / teto * 100, 100), i.valor ? 1.5 : 0);
      return `<div class="hbarra">
        <div class="hbarra__topo"><span class="hbarra__rotulo" title="${escaparHtml(i.rotulo)}">${escaparHtml(i.rotulo)}</span><span class="hbarra__valor">${escaparHtml(i.texto)}</span></div>
        <div class="hbarra__trilho"><div class="hbarra__preenchimento" style="width:${largura}%;${i.cor ? `background:${i.cor}` : ""}"></div></div>
        ${i.detalhe ? `<span class="hbarra__detalhe">${escaparHtml(i.detalhe)}</span>` : ""}
      </div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- linha acumulada (período x anterior)
  // Eixo X = dia do período (1º, 2º...). O anterior vai tracejado em cinza e pode ter outro tamanho (31 x 30 dias).
  function linhaAcumulada(container, dados) {
    const { atual, anterior, nomeAtual = "Este período", nomeAnterior = "Período anterior", cor = "#2a78d6", ate = atual.length } = dados;
    registrar(container, () => linhaAcumulada(container, dados));
    const acumular = (lista) => { let s = 0; return lista.map(p => (s += p.valor)); };
    const a = acumular(atual).slice(0, ate), b = acumular(anterior);
    if (!a.some(v => v) && !b.some(v => v)) { container.innerHTML = '<p class="grafico-vazio">Sem vendas confirmadas neste período nem no anterior.</p>'; return; }
    const n = Math.max(atual.length, anterior.length, 2);
    const W = Math.max(container.clientWidth, 260), H = 240, ML = 58, MR = 18, MT = 24, MB = 26;
    const { max, marcas } = escala(0, Math.max(...a, ...b));
    const x = (i) => ML + i * (W - ML - MR) / (n - 1);
    const y = (v) => MT + (H - MT - MB) * (1 - v / max);
    const caminho = (serie) => serie.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const grade = marcas.map(m => `<line class="grafico__grade${m === 0 ? " grafico__grade--zero" : ""}" x1="${ML}" x2="${W - MR}" y1="${y(m)}" y2="${y(m)}"/>
      <text class="grafico__eixo" x="${ML - 8}" y="${y(m) + 4}" text-anchor="end">${escaparHtml(eixo(m))}</text>`).join("");
    const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - ML - MR) / 70))));
    const eixoX = atual.length >= anterior.length ? atual : anterior;
    const rotulosX = eixoX.map((p, i) => (i % passo === 0 ? `<text class="grafico__eixo" x="${x(i)}" y="${H - 8}" text-anchor="middle">${escaparHtml(formatarData(p.data).slice(0, 5))}</text>` : "")).join("");
    const ult = a.length - 1;
    const area = a.length ? `<path d="M${x(0)},${y(0)} ${caminho(a).replace(/^M/, "L")} L${x(ult)},${y(0)}Z" fill="${cor}" fill-opacity=".10"/>` : "";
    const rotuloFinal = a.length ? `<circle cx="${x(ult)}" cy="${y(a[ult])}" r="4" fill="${cor}" stroke="#fff" stroke-width="2"/>
      <text class="grafico__valor" x="${x(ult) + (x(ult) > W - 110 ? -8 : 8)}" y="${y(a[ult]) - 9}" text-anchor="${x(ult) > W - 110 ? "end" : "start"}">${escaparHtml(formatarMoeda(a[ult]))}</text>` : "";
    container.innerHTML = `${legendaHtml([{ nome: nomeAtual, cor }, { nome: nomeAnterior, tracejado: true }])}<div class="grafico__area">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escaparHtml(`Vendas acumuladas: ${formatarMoeda(a[ult] || 0)} neste período, ${formatarMoeda(b[b.length - 1] || 0)} no anterior`)}">
        ${grade}${rotulosX}
        <path d="${caminho(b)}" fill="none" stroke="#C3C9D3" stroke-width="2" stroke-dasharray="5 4"/>
        ${area}<path d="${caminho(a)}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>
        ${rotuloFinal}
        <line class="grafico__mira" y1="${MT}" y2="${H - MB}" x1="0" x2="0" visibility="hidden"/>
      </svg><div class="grafico__dica" hidden></div></div>`;
    const svg = container.querySelector("svg"), mira = container.querySelector(".grafico__mira"), caixaArea = container.querySelector(".grafico__area");
    caixaArea._dicaDinamica = (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width);
      if (px < ML - 4 || px > W - MR + 4) { mira.setAttribute("visibility", "hidden"); return null; }
      const i = Math.min(n - 1, Math.max(0, Math.round((px - ML) / ((W - ML - MR) / (n - 1)))));
      mira.setAttribute("x1", x(i)); mira.setAttribute("x2", x(i)); mira.setAttribute("visibility", "visible");
      const lado = (lista, serie) => (i < lista.length ? `${formatarData(lista[i].data)}: ${i < serie.length ? formatarMoeda(serie[i]) : "—"}` : "—");
      return `${lado(atual, a)} · ${lado(anterior, b)}`;
    };
    caixaArea._aoSair = () => mira.setAttribute("visibility", "hidden");
    ligarDica(container);
  }

  // ---------------------------------------------------------------- rosca (partes de um todo, até 5 fatias)
  function rosca(container, itens, { centro = "", subcentro = "" } = {}) {
    const total = itens.reduce((s, i) => s + i.valor, 0);
    if (!total) { container.innerHTML = '<p class="grafico-vazio">Sem vendas confirmadas neste período.</p>'; return; }
    const R = 70, r = 46, c = 75;
    let ang = -Math.PI / 2;
    const ponto = (raio, a) => `${(c + raio * Math.cos(a)).toFixed(2)},${(c + raio * Math.sin(a)).toFixed(2)}`;
    const fatias = itens.map(i => {
      const frac = i.valor / total;
      const dica = `${i.rotulo}: ${formatarMoeda(i.valor)} (${pct(frac * 100)})`;
      if (frac >= 0.9999) return `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${i.cor}" stroke-width="${R - r}" data-dica="${escaparHtml(dica)}"/>`;
      const a2 = ang + frac * 2 * Math.PI, folga = itens.length > 1 ? Math.min(0.02, frac * Math.PI) : 0, grande = frac > 0.5 ? 1 : 0;
      const d = `M${ponto(R, ang + folga)} A${R},${R} 0 ${grande} 1 ${ponto(R, a2 - folga)} L${ponto(r, a2 - folga)} A${r},${r} 0 ${grande} 0 ${ponto(r, ang + folga)}Z`;
      ang = a2;
      return `<path class="grafico__fatia" d="${d}" fill="${i.cor}" data-dica="${escaparHtml(dica)}"/>`;
    }).join("");
    container.innerHTML = `<div class="rosca"><div class="grafico__area rosca__grafico">
        <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="${escaparHtml(itens.map(i => `${i.rotulo} ${pct(i.valor / total * 100)}`).join(", "))}">
          ${fatias}
          <text class="rosca__centro" x="${c}" y="${c + 2}" text-anchor="middle">${escaparHtml(centro)}</text>
          <text class="grafico__eixo" x="${c}" y="${c + 18}" text-anchor="middle">${escaparHtml(subcentro)}</text>
        </svg><div class="grafico__dica" hidden></div></div>
      <ul class="rosca__legenda">${itens.map(i => `<li><i style="background:${i.cor}"></i><span class="rosca__nome">${escaparHtml(i.rotulo)}</span>
        <strong>${escaparHtml(formatarMoeda(i.valor))}</strong><span class="rosca__pct">${pct(i.valor / total * 100)}</span></li>`).join("")}</ul></div>`;
    ligarDica(container);
  }

  // ---------------------------------------------------------------- mini-linha (tendência dentro do cartão)
  function miniLinha(container, valores, cor = "#2a78d6") {
    registrar(container, () => miniLinha(container, valores, cor));
    const v = valores.map(x => Number(x) || 0);
    if (v.length < 2) { container.innerHTML = ""; return; }
    const W = Math.max(container.clientWidth, 60), H = 28, min = Math.min(...v), max = Math.max(...v), amp = (max - min) || 1;
    const x = (i) => 3 + i * (W - 6) / (v.length - 1), y = (val) => H - 4 - (val - min) / amp * (H - 8);
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <path d="${v.map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join("")}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(v.length - 1)}" cy="${y(v[v.length - 1])}" r="3" fill="${cor}"/></svg>`;
  }

  // ---------------------------------------------------------------- barra segmentada (situação de um conjunto)
  function segmentada(container, partes) {
    const total = partes.reduce((s, p) => s + p.valor, 0);
    if (!total) { container.innerHTML = '<p class="grafico-vazio">Nada cadastrado.</p>'; return; }
    container.innerHTML = `<div class="segmentada" role="img" aria-label="${escaparHtml(partes.map(p => `${p.rotulo}: ${p.valor}`).join(", "))}">
        ${partes.filter(p => p.valor).map(p => `<span style="flex:${p.valor};background:${p.cor}" title="${escaparHtml(`${p.rotulo}: ${p.valor}`)}">${p.valor}</span>`).join("")}
      </div>
      <div class="segmentada__legenda">${partes.map(p => `<span><i style="background:${p.cor}"></i>${escaparHtml(p.rotulo)} · ${pct(p.valor / total * 100)}</span>`).join("")}</div>`;
  }

  return { barrasAgrupadas, barrasHorizontais, linhaAcumulada, rosca, miniLinha, segmentada };
})();
