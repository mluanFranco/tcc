// Gráficos do Dashboard feitos à mão (SVG + CSS), sem biblioteca externa.
//   graficos.barrasAgrupadas(container, { rotulos, series: [{ nome, valores, cor }], rotuloAcessivel })
//   graficos.barrasHorizontais(container, [{ rotulo, valor, texto, detalhe, cor }], { maximo })
// Valores negativos descem abaixo da linha do zero. Depende de formatadores.js (escaparHtml, formatarMoeda).

const graficos = (() => {
  const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const eixo = (v) => (v === 0 ? "0" : compacto.format(v));

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
  const registrados = new Map();
  let temporizador = null;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      registrados.forEach((opcoes, container) => {
        if (!container.isConnected) { registrados.delete(container); return; }
        if (Math.abs(container.clientWidth - (opcoes.largura || 0)) > 8) barrasAgrupadas(container, opcoes.dados);
      });
    }, 150);
  });

  function barrasAgrupadas(container, dados) {
    const { rotulos, series, rotuloAcessivel = "" } = dados;
    registrados.set(container, { dados, largura: container.clientWidth });
    const todos = series.flatMap(s => s.valores);
    if (rotulos.length === 0 || todos.every(v => v === 0)) {
      container.innerHTML = '<p class="grafico-vazio">Sem movimento neste período.</p>';
      return;
    }
    const W = Math.max(container.clientWidth, 260), H = 260, ML = 52, MR = 8, MT = 10, MB = 30;
    const { min, max, marcas } = escala(Math.min(...todos), Math.max(...todos));
    const y = (v) => MT + (H - MT - MB) * (1 - (v - min) / (max - min));
    const largGrupo = (W - ML - MR) / rotulos.length;
    const largBarra = Math.min(34, (largGrupo * 0.72) / series.length);
    const grade = marcas.map(m => `<line class="grafico__grade${m === 0 ? " grafico__grade--zero" : ""}" x1="${ML}" x2="${W - MR}" y1="${y(m)}" y2="${y(m)}"/>
      <text class="grafico__eixo" x="${ML - 8}" y="${y(m) + 4}" text-anchor="end">${escaparHtml(eixo(m))}</text>`).join("");
    const barras = rotulos.map((rotulo, i) => {
      const x0 = ML + largGrupo * i + (largGrupo - largBarra * series.length) / 2;
      const grupo = series.map((s, j) => {
        const v = s.valores[i];
        const topoY = Math.min(y(v), y(0));
        const alt = Math.max(Math.abs(y(v) - y(0)), v === 0 ? 0 : 1.5);
        const cor = v < 0 && s.corNegativa ? s.corNegativa : s.cor;
        return `<rect class="grafico__barra" x="${x0 + largBarra * j}" y="${topoY}" width="${largBarra - 3}" height="${alt}" rx="3" fill="${cor}"
          data-dica="${escaparHtml(`${rotulo} · ${s.nome}: ${formatarMoeda(v)}`)}" tabindex="-1"/>`;
      }).join("");
      return grupo + `<text class="grafico__eixo" x="${ML + largGrupo * (i + 0.5)}" y="${H - 9}" text-anchor="middle">${escaparHtml(largGrupo < 56 ? rotulo.split("/")[0] : rotulo)}</text>`;
    }).join("");
    const legenda = series.length > 1
      ? `<div class="grafico__legenda">${series.map(s => `<span><i style="background:${s.cor}"></i>${escaparHtml(s.nome)}</span>`).join("")}</div>` : "";
    container.innerHTML = `${legenda}<div class="grafico__area">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escaparHtml(rotuloAcessivel)}" preserveAspectRatio="xMidYMid meet">${grade}${barras}</svg>
      <div class="grafico__dica" hidden></div></div>`;
    ligarDica(container);
  }

  function ligarDica(container) {
    const area = container.querySelector(".grafico__area");
    const dica = container.querySelector(".grafico__dica");
    area.addEventListener("mousemove", (e) => {
      const alvo = e.target.closest("[data-dica]");
      if (!alvo) { dica.hidden = true; return; }
      const caixa = area.getBoundingClientRect();
      dica.textContent = alvo.dataset.dica;
      dica.hidden = false;
      const x = Math.min(e.clientX - caixa.left + 12, caixa.width - dica.offsetWidth - 4);
      dica.style.left = `${Math.max(0, x)}px`;
      dica.style.top = `${Math.max(0, e.clientY - caixa.top - 34)}px`;
    });
    area.addEventListener("mouseleave", () => { dica.hidden = true; });
  }

  function barrasHorizontais(container, itens, { maximo = null } = {}) {
    if (!itens.length) { container.innerHTML = ""; return; }
    const teto = maximo ?? Math.max(...itens.map(i => Math.abs(i.valor)), 1);
    container.innerHTML = itens.map(i => {
      const pct = Math.max(Math.min(Math.abs(i.valor) / teto * 100, 100), i.valor ? 1.5 : 0);
      return `<div class="hbarra">
        <div class="hbarra__topo"><span class="hbarra__rotulo" title="${escaparHtml(i.rotulo)}">${escaparHtml(i.rotulo)}</span><span class="hbarra__valor">${escaparHtml(i.texto)}</span></div>
        <div class="hbarra__trilho"><div class="hbarra__preenchimento" style="width:${pct}%;${i.cor ? `background:${i.cor}` : ""}"></div></div>
        ${i.detalhe ? `<span class="hbarra__detalhe">${escaparHtml(i.detalhe)}</span>` : ""}
      </div>`;
    }).join("");
  }

  return { barrasAgrupadas, barrasHorizontais };
})();
