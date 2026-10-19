// Detalhe da Cotação: leitura, ações por status e edição (o mesmo formulário da Nova Cotação).
//
// Status (o backend impõe; a tela só mostra o que cabe):
//   compra: rascunho → enviada → recebida (fornecedor respondeu; exige todos os preços) → aprovada | recusada
//   venda : rascunho → enviada → aprovada | recusada
// Editável: rascunho, enviada e recebida. Aprovar gera o pedido correspondente numa só transação
// (compra → pedido de compra, com as contas a pagar; venda → pedido de venda aberto, reservando estoque).
// Aprovar também exige poder editar o módulo do pedido gerado (compras.editar ou vendas.editar).

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("cotacoes.ver")) return;

  const params = new URLSearchParams(window.location.search);
  const cotacaoId = Number(params.get("id"));
  const recemCriada = params.get("novo") === "1";

  const podeEditar = temPermissao("cotacoes.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    estadoPagina: $("estado-pagina"), conteudo: $("conteudo-cotacao"), titulo: $("titulo-cotacao"),
    pilulaTipo: $("pilula-tipo"), pilulaStatus: $("pilula-status"), pilulaVencida: $("pilula-vencida"),
    faixaAviso: $("faixa-aviso"), linkVoltar: $("link-voltar"),
    botaoPdf: $("botao-pdf"), botaoEditar: $("botao-editar"), botaoEnviar: $("botao-enviar"),
    botaoResposta: $("botao-resposta"), botaoAprovar: $("botao-aprovar"), botaoRecusar: $("botao-recusar"),
    botaoExcluir: $("botao-excluir"), botaoSalvar: $("botao-salvar"), botaoCancelarEdicao: $("botao-cancelar-edicao"),
    vista: $("vista"), edicao: $("edicao"),
    rotuloParte: $("vis-rotulo-parte"), parte: $("vis-parte"), forma: $("vis-forma"), data: $("vis-data"),
    validade: $("vis-validade"), rotuloEntrega: $("vis-rotulo-entrega"), entrega: $("vis-entrega"), observacao: $("vis-observacao"),
    thDesconto: $("th-desconto"), itensCorpo: $("itens-corpo"), total: $("total-exibicao"),
    cartaoPedido: $("cartao-pedido"), textoPedido: $("texto-pedido")
  };

  const STATUS_EDITAVEIS = ["rascunho", "enviada", "recebida"];
  const RECUSAVEIS = { compra: ["rascunho", "enviada", "recebida"], venda: ["rascunho", "enviada"] };
  const ROTULOS = { rascunho: "Rascunho", enviada: "Enviada", recebida: "Recebida", aprovada: "Aprovada", recusada: "Recusada" };

  let cotacao = null;
  let parte = null;             // fornecedor ou cliente
  let forma = null;
  let produtosPorId = {};
  let siglasPorUnidade = {};
  let ocupado = false;
  let modoEdicao = null;        // null | "editar" | "resposta"
  let formulario = null;
  let salvando = false;
  let saindo = false;

  const ehVenda = () => cotacao.tipo === "venda";
  const numero = () => formatarNumeroPedido(cotacao.id);

  function hojeTexto() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Só faz sentido falar em "vencida" enquanto a cotação ainda poderia ser aprovada.
  const estaVencida = () => Boolean(cotacao.validade) && cotacao.validade < hojeTexto() && STATUS_EDITAVEIS.includes(cotacao.status);

  function mostrarErroDePagina(mensagem) {
    el.estadoPagina.textContent = mensagem;
    el.estadoPagina.hidden = false;
    el.conteudo.hidden = true;
  }

  // ---------- Desenho (leitura) ----------

  function resumoDasParcelas() {
    if (!forma || !forma.parcelas?.length) return "conforme a forma de pagamento";
    const parcelas = forma.parcelas;
    if (parcelas.length === 1) {
      return parcelas[0].prazo_dias === 0 ? "1 parcela, à vista" : `1 parcela em ${parcelas[0].prazo_dias} dias`;
    }
    return `${parcelas.length} parcelas (${parcelas.map(p => p.prazo_dias).join("/")} dias)`;
  }

  function renderizarItens() {
    const venda = ehVenda();
    el.thDesconto.hidden = !venda;
    el.itensCorpo.innerHTML = cotacao.itens.slice().sort((a, b) => a.id - b.id).map(item => {
      const produto = produtosPorId[item.produto_id];
      const nome = produto ? produto.nome : `Produto #${item.produto_id}`;
      const sigla = produto ? (siglasPorUnidade[produto.unidade_medida_id] || "") : "";
      const semPreco = item.preco_unitario === null || item.preco_unitario === undefined;
      const bruto = Number(item.quantidade) * Number(item.preco_unitario || 0);
      const pct = bruto > 0 ? Math.round((Number(item.desconto) / bruto) * 10000) / 100 : 0;
      const desconto = Number(item.desconto) > 0 ? `${formatarMoeda(item.desconto)} (${formatarNumero(pct)}%)` : "—";
      const obs = item.observacao ? `<br><small class="nota-cartao">${escaparHtml(item.observacao)}</small>` : "";
      return `
        <tr>
          <td>${escaparHtml(nome)}${obs}</td>
          <td class="num">${formatarNumero(item.quantidade)}${sigla ? " " + escaparHtml(sigla) : ""}</td>
          <td class="num${semPreco ? " celula-sem-valor" : ""}">${semPreco ? "A definir" : formatarMoeda(item.preco_unitario)}</td>
          ${venda ? `<td class="num">${desconto}</td>` : ""}
          <td class="num subtotal${semPreco ? " celula-sem-valor" : ""}">${semPreco ? "—" : formatarMoeda(item.subtotal)}</td>
        </tr>`;
    }).join("");

    const total = cotacao.valor_total;
    el.total.textContent = total === null || total === undefined ? "A definir (faltam preços)" : formatarMoeda(total);
    el.total.classList.toggle("total-pedido__valor--pendente", total === null || total === undefined);
  }

  function renderizarCotacao() {
    const venda = ehVenda();

    el.titulo.textContent = `Cotação: ${numero()}`;
    el.pilulaTipo.textContent = venda ? "Venda" : "Compra";
    el.pilulaTipo.className = `pilula-status pilula-status--tipo-${cotacao.tipo}`;
    el.pilulaStatus.textContent = ROTULOS[cotacao.status] || cotacao.status;
    el.pilulaStatus.className = `pilula-status pilula-status--${cotacao.status}`;
    el.pilulaVencida.hidden = !estaVencida();

    el.rotuloParte.textContent = venda ? "Cliente" : "Fornecedor";
    const documento = parte ? (venda ? parte.cpf_cnpj : parte.cnpj) : null;
    const idDaParte = venda ? cotacao.cliente_id : cotacao.fornecedor_id;
    el.parte.textContent = parte
      ? (documento ? `${parte.nome} (${formatarDocumento(documento)})` : parte.nome)
      : `${venda ? "Cliente" : "Fornecedor"} #${idDaParte}`;
    el.forma.textContent = forma ? forma.descricao : "Não definida";
    el.data.textContent = formatarDataHora(cotacao.data_cotacao);
    el.validade.textContent = cotacao.validade ? formatarData(cotacao.validade) : "—";
    el.rotuloEntrega.textContent = venda ? "Entrega" : "Entrega prevista";
    el.entrega.textContent = venda
      ? (cotacao.endereco_entrega ? formatarEndereco(cotacao.endereco_entrega) : "Retirada (sem entrega)")
      : formatarData(cotacao.data_entrega_prevista);
    el.observacao.textContent = cotacao.observacao || "—";

    renderizarItens();
    renderizarPedidoGerado();

    if (estaVencida()) {
      el.faixaAviso.textContent = `Esta cotação venceu em ${formatarData(cotacao.validade)} e não pode mais ser aprovada. ` +
        (podeEditar ? "Use Editar para definir uma nova validade." : "");
      el.faixaAviso.hidden = false;
    } else {
      el.faixaAviso.hidden = true;
    }

    document.title = `Cotação ${numero()} — Nova Sorvetes`;
    el.estadoPagina.hidden = true;
    el.conteudo.hidden = false;
    atualizarBotoes();
  }

  function renderizarPedidoGerado() {
    const pedidoId = cotacao.pedido_venda_id || cotacao.pedido_compra_id;
    el.cartaoPedido.hidden = !pedidoId;
    if (!pedidoId) return;
    const venda = Boolean(cotacao.pedido_venda_id);
    const rotulo = `${venda ? "Pedido de venda" : "Pedido de compra"} ${formatarNumeroPedido(pedidoId)}`;
    const pode = temPermissao(venda ? "vendas.ver" : "compras.ver");
    const url = `${venda ? "pedido-venda-detalhe" : "pedido-compra-detalhe"}.html?id=${pedidoId}`;
    el.textoPedido.innerHTML = pode
      ? `A aprovação gerou o <a class="link-pedido" href="${url}">${escaparHtml(rotulo)}</a>.`
      : `A aprovação gerou o ${escaparHtml(rotulo)}.`;
  }

  // ---------- Botões ----------

  function podeAprovarAgora() {
    if (!podeEditar) return false;
    if (!temPermissao(ehVenda() ? "vendas.editar" : "compras.editar")) return false;
    return ehVenda() ? cotacao.status === "enviada" : cotacao.status === "recebida";
  }

  function atualizarBotoes() {
    const editando = modoEdicao !== null;
    const status = cotacao.status;
    const mostrar = (botao, visivel) => { botao.hidden = !visivel; botao.disabled = ocupado || salvando; };

    mostrar(el.botaoPdf, !editando);
    mostrar(el.botaoEditar, !editando && podeEditar && STATUS_EDITAVEIS.includes(status));
    mostrar(el.botaoEnviar, !editando && podeEditar && status === "rascunho");
    mostrar(el.botaoResposta, !editando && podeEditar && !ehVenda() && ["rascunho", "enviada"].includes(status));
    mostrar(el.botaoAprovar, !editando && podeAprovarAgora());
    mostrar(el.botaoRecusar, !editando && podeEditar && RECUSAVEIS[cotacao.tipo].includes(status));
    mostrar(el.botaoExcluir, !editando && podeEditar && !cotacao.pedido_venda_id && !cotacao.pedido_compra_id);
    mostrar(el.botaoSalvar, editando);
    mostrar(el.botaoCancelarEdicao, editando);
    el.botaoSalvar.textContent = modoEdicao === "resposta" ? "Salvar e marcar como recebida" : "Salvar alterações";

    el.vista.hidden = editando;
    el.edicao.hidden = !editando;
    el.pilulaVencida.hidden = !estaVencida();
  }

  function definirOcupado(valor) {
    ocupado = valor;
    atualizarBotoes();
  }

  async function recarregar() {
    try {
      cotacao = await cotacaoService.buscarPorId(cotacao.id);
      await carregarApoioDaCotacao();
      renderizarCotacao();
    } catch (erro) {
      definirOcupado(false);
    }
  }

  // ---------- Ações de status ----------

  async function mudarStatus(novoStatus, { titulo, mensagem, textoConfirmar, sucesso, perigo = false }) {
    if (ocupado) return;
    if (titulo) {
      const confirmou = await confirmarAcao({ titulo, mensagem, textoConfirmar, textoCancelar: "Voltar", perigo });
      if (!confirmou) return;
    }
    definirOcupado(true);
    try {
      cotacao = await cotacaoService.atualizarStatus(cotacao.id, novoStatus);
      renderizarCotacao();
      definirOcupado(false);
      toast.sucesso(sucesso);
    } catch (erro) {
      toast.erro(erro.message);
      await recarregar();   // o status pode ter mudado em outra aba/usuário
      definirOcupado(false);
    }
  }

  function enviar() {
    return mudarStatus("enviada", { sucesso: `Cotação ${numero()} marcada como enviada.` });
  }

  function recusar() {
    return mudarStatus("recusada", {
      titulo: `Recusar a cotação ${numero()}?`,
      mensagem: "A cotação ficará como recusada e não poderá mais ser alterada nem aprovada.",
      textoConfirmar: "Recusar cotação",
      perigo: true,
      sucesso: `Cotação ${numero()} recusada.`
    });
  }

  async function aprovar() {
    if (ocupado) return;

    // Conferências que o servidor também faz, com mensagem de quem usa a tela
    if (cotacao.validade && cotacao.validade < hojeTexto()) {
      toast.erro(`A cotação venceu em ${formatarData(cotacao.validade)}. Use Editar para definir uma nova validade antes de aprovar.`);
      return;
    }
    if (cotacao.itens.some(i => i.preco_unitario === null || i.preco_unitario === undefined)) {
      toast.erro("Todos os itens precisam de preço para aprovar. Use Editar para completar.");
      return;
    }
    if (!cotacao.forma_pagamento_id) {
      toast.erro("Defina a forma de pagamento (Editar) antes de aprovar: é dela que saem as parcelas do financeiro.");
      return;
    }

    const mensagem = ehVenda()
      ? `Será criado um pedido de venda em aberto e o estoque dos itens ficará reservado. O pedido ainda precisa ser confirmado depois (${resumoDasParcelas()}).`
      : `Será criado um pedido de compra e as contas a pagar serão geradas: ${resumoDasParcelas()}.`;
    const confirmou = await confirmarAcao({
      titulo: `Aprovar a cotação ${numero()}?`,
      mensagem,
      textoConfirmar: "Aprovar cotação",
      textoCancelar: "Voltar"
    });
    if (!confirmou) return;

    definirOcupado(true);
    try {
      const resposta = await cotacaoService.aprovar(cotacao.id);
      cotacao = resposta.cotacao;
      renderizarCotacao();
      definirOcupado(false);
      const rotuloPedido = resposta.pedido_tipo === "venda" ? "Pedido de venda" : "Pedido de compra";
      toast.sucesso(`Cotação aprovada. ${rotuloPedido} ${formatarNumeroPedido(resposta.pedido_id)} criado.`);
    } catch (erro) {
      toast.erro(erro.message);   // nada foi gravado: a cotação continua como estava
      await recarregar();
      definirOcupado(false);
    }
  }

  async function excluir() {
    if (ocupado) return;
    const confirmou = await confirmarAcao({
      titulo: `Excluir a cotação ${numero()}?`,
      mensagem: "A cotação e seus itens serão apagados definitivamente. Esta ação não pode ser desfeita.",
      textoConfirmar: "Excluir cotação",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!confirmou) return;

    definirOcupado(true);
    try {
      await cotacaoService.excluir(cotacao.id);
      saindo = true;
      window.location.href = `cotacoes.html?excluida=${cotacao.id}`;
    } catch (erro) {
      toast.erro(erro.message);
      await recarregar();
      definirOcupado(false);
    }
  }

  // ---------- Edição ----------

  async function entrarEmEdicao(modo) {
    if (ocupado || modoEdicao) return;
    definirOcupado(true);
    modoEdicao = modo;
    formulario = criarFormularioCotacao($("cotacao-form"), { modo: "editar", cotacao });
    atualizarBotoes();
    try {
      await formulario.pronto;
    } catch (erro) {
      modoEdicao = null;
      formulario = null;
      definirOcupado(false);
      return;
    }
    if (modo === "resposta") {
      formulario.exigirPrecos(true);
      formulario.focarPrimeiroPrecoVazio();
      toast.info("Preencha o preço cotado pelo fornecedor em cada item e salve para marcar a cotação como recebida.");
    } else {
      formulario.focar();
    }
    definirOcupado(false);
  }

  function sairDaEdicao() {
    modoEdicao = null;
    formulario = null;
    $("cotacao-form").innerHTML = "";
    renderizarCotacao();
  }

  async function cancelarEdicao() {
    if (salvando) return;
    if (formulario && formulario.alterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi alterado ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    sairDaEdicao();
  }

  async function salvarEdicao() {
    if (salvando || !formulario) return;
    const problema = formulario.validar();
    if (problema) {
      toast.erro(problema.mensagem);
      if (problema.foco && problema.foco.focus) problema.foco.focus();
      return;
    }

    salvando = true;
    atualizarBotoes();
    el.botaoSalvar.textContent = "Salvando...";
    const resposta = modoEdicao === "resposta";

    let atualizada;
    try {
      atualizada = await cotacaoService.atualizar(cotacao.id, formulario.montarPayload());
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      atualizarBotoes();
      return;
    }
    cotacao = atualizada;

    if (!resposta) {
      salvando = false;
      await carregarApoioDaCotacao();
      sairDaEdicao();
      toast.sucesso("Cotação atualizada.");
      return;
    }

    // Registrar resposta: os preços já estão salvos; agora a cotação passa para "recebida"
    try {
      cotacao = await cotacaoService.atualizarStatus(cotacao.id, "recebida");
      salvando = false;
      await carregarApoioDaCotacao();
      sairDaEdicao();
      toast.sucesso("Preços salvos. Cotação marcada como recebida; agora ela pode ser aprovada.");
    } catch (erro) {
      salvando = false;
      await carregarApoioDaCotacao();
      sairDaEdicao();
      toast.erro(`Os preços foram salvos, mas não foi possível marcar a cotação como recebida: ${erro.message}`);
    }
  }

  // ---------- PDF ----------

  function baixarArquivo(url, nome) {
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function abrirPdf() {
    // A aba é aberta já no clique (antes da espera pela API), senão o navegador a trata como pop-up.
    const aba = window.open("", "_blank");
    el.botaoPdf.disabled = true;
    try {
      const blob = await cotacaoService.baixarPdf(cotacao.id);
      const url = URL.createObjectURL(blob);
      if (aba) aba.location.href = url;
      else baixarArquivo(url, `cotacao-${cotacao.tipo}-${cotacao.id}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (erro) {
      if (aba) aba.close();
      toast.erro(erro.message);
    } finally {
      el.botaoPdf.disabled = false;
    }
  }

  // ---------- Eventos ----------

  el.botaoPdf.addEventListener("click", abrirPdf);
  el.botaoEditar.addEventListener("click", () => entrarEmEdicao("editar"));
  el.botaoResposta.addEventListener("click", () => entrarEmEdicao("resposta"));
  el.botaoEnviar.addEventListener("click", enviar);
  el.botaoAprovar.addEventListener("click", aprovar);
  el.botaoRecusar.addEventListener("click", recusar);
  el.botaoExcluir.addEventListener("click", excluir);
  el.botaoSalvar.addEventListener("click", salvarEdicao);
  el.botaoCancelarEdicao.addEventListener("click", cancelarEdicao);
  el.edicao.addEventListener("submit", (e) => e.preventDefault());

  el.linkVoltar.addEventListener("click", async (evento) => {
    if (modoEdicao && formulario && formulario.alterado()) {
      evento.preventDefault();
      const descartar = await confirmarAcao({
        titulo: "Descartar as alterações?",
        mensagem: "O que foi alterado ainda não foi salvo e será perdido.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (descartar) { saindo = true; window.location.href = "cotacoes.html"; }
    }
  });

  window.addEventListener("beforeunload", (evento) => {
    if (modoEdicao && !saindo && !salvando && formulario && formulario.alterado()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });

  // ---------- Carga ----------

  // Fornecedor/cliente e forma de pagamento da cotação atual (só enriquecem a tela: se falharem, mostra o que há)
  async function carregarApoioDaCotacao() {
    const [rParte, rForma] = await Promise.allSettled([
      ehVenda() ? clienteService.buscarPorId(cotacao.cliente_id) : fornecedorService.buscarPorId(cotacao.fornecedor_id),
      cotacao.forma_pagamento_id ? formaPagamentoService.buscarPorId(cotacao.forma_pagamento_id) : Promise.resolve(null)
    ]);
    parte = rParte.status === "fulfilled" ? rParte.value : null;
    forma = rForma.status === "fulfilled" ? rForma.value : null;
  }

  if (!Number.isInteger(cotacaoId) || cotacaoId <= 0) {
    mostrarErroDePagina("Cotação não informada.");
    toast.erro("Cotação não informada.");
    return;
  }

  try {
    cotacao = await cotacaoService.buscarPorId(cotacaoId);
  } catch (erro) {
    mostrarErroDePagina(erro.status === 404 ? "Cotação não encontrada." : "Não foi possível carregar a cotação.");
    toast.erro(erro.message);
    return;
  }

  const [rProdutos, rUnidades] = await Promise.allSettled([
    produtoService.listar({ incluirInativos: true }),
    unidadeMedidaService.listar({ incluirInativos: true })
  ]);
  if (rProdutos.status === "fulfilled") produtosPorId = Object.fromEntries(rProdutos.value.map(p => [p.id, p]));
  if (rUnidades.status === "fulfilled") siglasPorUnidade = Object.fromEntries(rUnidades.value.map(u => [u.id, u.sigla]));
  await carregarApoioDaCotacao();
  renderizarCotacao();

  if (recemCriada) {
    toast.sucesso(`Cotação ${numero()} criada como rascunho.`);
    history.replaceState(null, "", `cotacao-detalhe.html?id=${cotacao.id}`);
  }
});
