// Detalhe de um título financeiro: dados, histórico de baixas e as ações (baixa, estorno, edição, cancelamento).
// O saldo e o status vêm sempre da API; a tela nunca recalcula nada por conta própria.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("financeiro.ver")) return;
  const podeEditar = temPermissao("financeiro.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    estado: $("estado-pagina"), conteudo: $("conteudo-titulo"),
    linkVoltar: $("link-voltar"), textoVoltar: $("texto-voltar"),
    titulo: $("titulo-pagina"), pilula: $("pilula-situacao"),
    botaoBaixa: $("botao-baixa"), botaoEditar: $("botao-editar"), botaoCancelar: $("botao-cancelar"),
    aviso: $("aviso-origem"),
    tipo: $("vis-tipo"), categoria: $("vis-categoria"), parteRotulo: $("vis-parte-rotulo"), parte: $("vis-parte"),
    origem: $("vis-origem"), parcela: $("vis-parcela"), vencimento: $("vis-vencimento"),
    valor: $("vis-valor"), pagoRotulo: $("vis-pago-rotulo"), pago: $("vis-pago"), saldo: $("vis-saldo"),
    blocoTaxa: $("bloco-taxa"), taxa: $("vis-taxa"),
    tituloBaixas: $("titulo-baixas"), baixasCorpo: $("baixas-corpo"), notaBaixas: $("nota-baixas")
  };

  let titulo = null;
  let ocupado = false;

  const id = Number(new URLSearchParams(location.search).get("id"));

  function mostrarErro(texto) {
    el.conteudo.hidden = true;
    el.estado.hidden = false;
    el.estado.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = texto;
    const voltar = document.createElement("a");
    voltar.href = "financeiro.html";
    voltar.textContent = "Voltar ao Financeiro";
    voltar.className = "celula-link";
    el.estado.append(p, voltar);
  }

  const centavos = (n) => Math.round(Number(n) * 100);
  const temBaixaValida = () => centavos(titulo.valor_pago) > 0;
  const editavel = () => podeEditar && titulo.avulso && titulo.status === "aberto" && !temBaixaValida();

  function definirOcupado(valor) {
    ocupado = valor;
    [el.botaoBaixa, el.botaoEditar, el.botaoCancelar].forEach(b => { b.disabled = valor; });
    el.baixasCorpo.querySelectorAll("button").forEach(b => { b.disabled = valor; });
  }

  function renderizarBaixas() {
    const receber = titulo.tipo === "receber";
    el.tituloBaixas.textContent = receber ? "Histórico de recebimentos" : "Histórico de pagamentos";
    const baixas = titulo.baixas || [];
    el.notaBaixas.hidden = baixas.length !== 0;
    el.notaBaixas.textContent = receber ? "Nenhum recebimento registrado." : "Nenhum pagamento registrado.";
    el.baixasCorpo.innerHTML = baixas.map(b => {
      const podeEstornar = podeEditar && !b.estornada && titulo.status !== "cancelado";
      const situacao = b.estornada
        ? `<span class="situacao-titulo situacao-titulo--cancelado">Estornada em ${escaparHtml(formatarDataHora(b.estornada_em))}</span>`
        : '<span class="situacao-titulo situacao-titulo--pago">Válida</span>';
      const botao = podeEstornar
        ? `<button type="button" class="botao-icone botao-icone--perigo" data-baixa="${b.id}" title="Estornar esta baixa" aria-label="Estornar a baixa de ${escaparHtml(formatarMoeda(b.valor))}">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
           </button>` : "";
      return `
        <tr class="${b.estornada ? "baixa--estornada" : ""}">
          <td>${formatarData(b.data_pagamento)}</td>
          <td class="num"><span class="baixa__valor">${formatarMoeda(b.valor)}</span></td>
          <td class="baixa__obs">${b.observacao ? escaparHtml(b.observacao) : "—"}</td>
          <td>${formatarDataHora(b.created_at)}</td>
          <td>${situacao}</td>
          <td class="acoes">${botao}</td>
        </tr>`;
    }).join("");
  }

  function renderizar() {
    const t = titulo;
    const receber = t.tipo === "receber";
    const situacao = situacaoTitulo(t);

    el.estado.hidden = true;
    el.conteudo.hidden = false;
    document.title = `${textoOrigemTitulo(t)} — Nova Sorvetes`;

    el.linkVoltar.href = `financeiro.html?aba=${t.tipo}`;
    el.textoVoltar.textContent = `Financeiro · ${rotuloTipoTitulo(t.tipo)}`;
    el.titulo.textContent = textoOrigemTitulo(t) + (t.total_parcelas > 1 ? ` — parcela ${textoParcelaTitulo(t)}` : "");
    el.pilula.textContent = situacao.texto;
    el.pilula.className = `pilula-status pilula-status--titulo-${situacao.classe}`;

    el.tipo.textContent = rotuloTipoTitulo(t.tipo);
    el.categoria.textContent = t.categoria_nome || "—";
    el.parteRotulo.textContent = receber ? "Cliente" : "Fornecedor";
    el.parte.textContent = nomeParteTitulo(t) || "—";
    const link = linkOrigemTitulo(t);
    el.origem.textContent = "";
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.className = "celula-link";
      a.textContent = textoOrigemTitulo(t);
      el.origem.appendChild(a);
    } else {
      el.origem.textContent = t.avulso ? `Lançamento avulso` : textoOrigemTitulo(t);
    }
    el.parcela.textContent = `${t.numero_parcela} de ${t.total_parcelas}`;
    el.vencimento.textContent = formatarData(t.vencimento) + (t.vencido ? ` — ${t.dias_atraso} ${t.dias_atraso === 1 ? "dia" : "dias"} de atraso` : "");
    el.valor.textContent = formatarMoeda(t.valor);
    el.pagoRotulo.textContent = receber ? "Já recebido" : "Já pago";
    el.pago.textContent = formatarMoeda(t.valor_pago);
    el.saldo.textContent = t.status === "cancelado" ? "—" : formatarMoeda(t.saldo);

    const taxa = Number(t.taxa_percentual);
    el.blocoTaxa.hidden = !(receber && taxa > 0);
    if (!el.blocoTaxa.hidden) {
      const taxaValor = Math.round(centavos(t.valor) * taxa) / 10000;
      el.taxa.textContent = `${formatarNumero(taxa)}% (cerca de ${formatarMoeda(taxaValor)} neste título)`;
    }

    // Avisos sobre o que dá (ou não) para fazer com este título.
    let aviso = "";
    if (!t.avulso) {
      aviso = `Este título nasceu de um pedido e acompanha o pedido: para cancelá-lo, cancele o pedido${link ? ` (<a href="${escaparHtml(link)}">abrir o pedido</a>)` : ""}. Se já houver baixa, estorne-a antes.`;
    } else if (podeEditar && t.status !== "cancelado" && temBaixaValida()) {
      aviso = "Este lançamento já tem baixa registrada. Para editar ou cancelar, estorne as baixas primeiro.";
    }
    el.aviso.innerHTML = aviso;
    el.aviso.hidden = !aviso;

    el.botaoBaixa.textContent = receber ? "Registrar recebimento" : "Registrar pagamento";
    el.botaoBaixa.hidden = !(podeEditar && estaPendenteTitulo(t));
    el.botaoEditar.hidden = !editavel();
    el.botaoCancelar.hidden = !editavel();

    renderizarBaixas();
    definirOcupado(false);
  }

  async function carregar() {
    if (!Number.isInteger(id) || id <= 0) { mostrarErro("Título inválido."); return; }
    try {
      titulo = await financeiroService.buscarTitulo(id);
      renderizar();
    } catch (erro) {
      mostrarErro(erro.status === 404 ? "Título não encontrado." : `Não foi possível carregar o título. ${erro.message}`);
    }
  }

  async function aposAcao(atualizado) {
    titulo = atualizado;
    renderizar();
  }

  el.botaoBaixa.addEventListener("click", () => {
    if (ocupado) return;
    baixaModal.abrir({
      titulo,
      aoSalvar: aposAcao,
      aoAtualizar: aposAcao
    });
  });

  el.botaoEditar.addEventListener("click", () => {
    if (ocupado) return;
    lancamentoModal.abrir({ modo: "editar", titulo, aoSalvar: aposAcao });
  });

  el.botaoCancelar.addEventListener("click", async () => {
    if (ocupado) return;
    const ok = await confirmarAcao({
      titulo: "Cancelar este lançamento?",
      mensagem: `"${titulo.descricao}" (${formatarMoeda(titulo.valor)}, vencimento ${formatarData(titulo.vencimento)}) deixa de valer e não dá para desfazer.`,
      textoConfirmar: "Cancelar lançamento",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!ok) return;
    definirOcupado(true);
    try {
      titulo = await financeiroService.cancelarAvulso(titulo.id);
      toast.sucesso("Lançamento cancelado.");
      renderizar();
    } catch (erro) {
      toast.erro(erro.message);
      await recarregarSilencioso();
    }
  });

  el.baixasCorpo.addEventListener("click", async (e) => {
    const botao = e.target.closest("button[data-baixa]");
    if (!botao || ocupado) return;
    const baixa = (titulo.baixas || []).find(b => b.id === Number(botao.dataset.baixa));
    if (!baixa) return;
    const ok = await confirmarAcao({
      titulo: "Estornar esta baixa?",
      mensagem: `A baixa de ${formatarMoeda(baixa.valor)}, de ${formatarData(baixa.data_pagamento)}, será marcada como estornada (ela continua no histórico) e o saldo do título volta a aumentar.`,
      textoConfirmar: "Estornar baixa",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!ok) return;
    definirOcupado(true);
    try {
      titulo = await financeiroService.estornarBaixa(titulo.id, baixa.id);
      toast.sucesso("Baixa estornada.");
      renderizar();
    } catch (erro) {
      toast.erro(erro.message);
      await recarregarSilencioso();
    }
  });

  // Depois de um erro, mostra o estado real (o título pode ter mudado por fora).
  async function recarregarSilencioso() {
    try { titulo = await financeiroService.buscarTitulo(id); renderizar(); }
    catch { definirOcupado(false); }
  }

  await carregar();
});
