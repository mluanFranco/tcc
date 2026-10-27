// Detalhe do Pedido de Venda (somente leitura).
// O pedido não é editado depois de criado: só muda de status (aberto → confirmado/cancelado, confirmado → cancelado).
//  - Confirmar baixa o estoque e gera as contas a receber;
//  - Cancelar um pedido aberto libera a reserva; cancelar um confirmado devolve o estoque e cancela as contas a receber
//    (o backend recusa se alguma parcela já tiver recebimento lançado).

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("vendas.ver")) return;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = Number(params.get("id"));
  const pedidoRecemCriado = params.get("novo") === "1";

  const podeEditar = temPermissao("vendas.editar");
  const podeVerFinanceiro = temPermissao("financeiro.ver");

  const el = {
    estadoPagina: document.getElementById("estado-pagina"),
    conteudo: document.getElementById("conteudo-pedido"),
    titulo: document.getElementById("titulo-pedido"),
    pilula: document.getElementById("pilula-status"),
    botaoPdf: document.getElementById("botao-pdf"),
    botaoConfirmar: document.getElementById("botao-confirmar"),
    botaoCancelar: document.getElementById("botao-cancelar-pedido"),
    cliente: document.getElementById("vis-cliente"),
    forma: document.getElementById("vis-forma"),
    data: document.getElementById("vis-data"),
    entrega: document.getElementById("vis-entrega"),
    observacao: document.getElementById("vis-observacao"),
    itensCorpo: document.getElementById("itens-corpo"),
    total: document.getElementById("total-exibicao"),
    cartaoTitulos: document.getElementById("cartao-titulos"),
    titulosCorpo: document.getElementById("titulos-corpo"),
    notaTitulos: document.getElementById("nota-titulos")
  };

  let pedido = null;
  let cliente = null;
  let forma = null;
  let titulos = [];
  let produtosPorId = {};
  let siglasPorUnidade = {};
  let ocupado = false;

  const numeroDoPedido = () => formatarNumeroPedido(pedido.id);

  function mostrarErroDePagina(mensagem) {
    el.estadoPagina.textContent = mensagem;
    el.estadoPagina.hidden = false;
    el.conteudo.hidden = true;
  }

  // ---------- Desenho ----------

  function resumoDasParcelas() {
    if (!forma || !forma.parcelas?.length) return "conforme a forma de pagamento";
    const parcelas = forma.parcelas;
    if (parcelas.length === 1) {
      return parcelas[0].prazo_dias === 0 ? "1 parcela, à vista" : `1 parcela em ${parcelas[0].prazo_dias} dias`;
    }
    return `${parcelas.length} parcelas (${parcelas.map(p => p.prazo_dias).join("/")} dias)`;
  }

  function renderizarItens() {
    el.itensCorpo.innerHTML = pedido.itens.slice().sort((a, b) => a.id - b.id).map(item => {
      const produto = produtosPorId[item.produto_id];
      const nome = produto ? produto.nome : `Produto #${item.produto_id}`;
      const bruto = Number(item.quantidade) * Number(item.preco_unitario);
      const pct = bruto > 0 ? Math.round((Number(item.desconto) / bruto) * 10000) / 100 : 0;
      const desconto = Number(item.desconto) > 0
        ? `${formatarMoeda(item.desconto)} (${formatarNumero(pct)}%)`
        : "—";
      return `
        <tr>
          <td>${escaparHtml(nome)}</td>
          <td class="num">${escaparHtml(textoQuantidadeItem(item.quantidade, item.fator, produto, siglasPorUnidade))}</td>
          <td class="num">${formatarMoeda(item.preco_unitario)}</td>
          <td class="num">${desconto}</td>
          <td class="num subtotal">${formatarMoeda(item.subtotal)}</td>
        </tr>`;
    }).join("");
    el.total.textContent = formatarMoeda(pedido.valor_total);
  }

  function rotuloSituacao(titulo) {
    if (titulo.status === "cancelado") return { classe: "cancelado", texto: "Cancelado" };
    if (titulo.status === "pago") return { classe: "pago", texto: "Recebido" };
    if (titulo.vencido) return { classe: "vencido", texto: `Vencido (${titulo.dias_atraso} ${titulo.dias_atraso === 1 ? "dia" : "dias"})` };
    if (titulo.status === "parcial") return { classe: "parcial", texto: "Parcial" };
    return { classe: "aberto", texto: "Em aberto" };
  }

  function renderizarTitulos() {
    // Quem não tem financeiro.ver não vê o cartão; pedido aberto ainda não gerou contas.
    const mostrar = podeVerFinanceiro && pedido.status !== "aberto";
    el.cartaoTitulos.hidden = !mostrar;
    if (!mostrar) return;

    el.titulosCorpo.innerHTML = titulos.map(t => {
      const situacao = rotuloSituacao(t);
      return `
        <tr>
          <td>${t.numero_parcela}/${t.total_parcelas}</td>
          <td>${formatarData(t.vencimento)}</td>
          <td class="num">${formatarMoeda(t.valor)}</td>
          <td class="num">${formatarMoeda(t.valor_pago)}</td>
          <td><span class="situacao-titulo situacao-titulo--${situacao.classe}">${escaparHtml(situacao.texto)}</span></td>
        </tr>`;
    }).join("");

    let nota = "";
    if (titulos.length === 0) {
      nota = pedido.status === "cancelado"
        ? "Este pedido foi cancelado antes da confirmação e não gerou contas a receber."
        : "Nenhuma conta a receber encontrada para este pedido.";
    }
    el.notaTitulos.textContent = nota;
    el.notaTitulos.hidden = !nota;
  }

  function renderizarPedido() {
    el.titulo.textContent = `Pedido: ${numeroDoPedido()}`;
    el.pilula.textContent = rotuloStatusPedido(pedido.status);
    el.pilula.className = `pilula-status pilula-status--${pedido.status}`;

    el.cliente.textContent = cliente ? `${cliente.nome} (${formatarDocumento(cliente.cpf_cnpj)})` : `Cliente #${pedido.cliente_id}`;
    el.forma.textContent = forma ? forma.descricao : "—";
    el.data.textContent = formatarDataHora(pedido.data_pedido);
    el.entrega.textContent = pedido.endereco_entrega ? formatarEndereco(pedido.endereco_entrega) : "Retirada (sem entrega)";
    el.observacao.textContent = pedido.observacao || "—";

    renderizarItens();
    renderizarTitulos();

    el.botaoConfirmar.hidden = !(podeEditar && pedido.status === "aberto");
    el.botaoCancelar.hidden = !(podeEditar && (pedido.status === "aberto" || pedido.status === "confirmado"));
    definirOcupado(false);

    el.estadoPagina.hidden = true;
    el.conteudo.hidden = false;
    document.title = `Pedido ${numeroDoPedido()} — Nova Sorvetes`;
  }

  function definirOcupado(valor) {
    ocupado = valor;
    el.botaoConfirmar.disabled = valor;
    el.botaoCancelar.disabled = valor;
  }

  // ---------- Ações ----------

  async function carregarTitulos() {
    if (!podeVerFinanceiro || pedido.status === "aberto") {
      titulos = [];
      return;
    }
    try {
      titulos = await pedidoVendaService.listarTitulos(pedido.id);
    } catch (erro) {
      titulos = [];
      toast.erro(`Não foi possível carregar as contas a receber. ${erro.message}`);
    }
  }

  async function mudarStatus(novoStatus) {
    if (ocupado) return;

    const numero = numeroDoPedido();
    let config;
    if (novoStatus === "confirmado") {
      config = {
        titulo: `Confirmar o pedido ${numero}?`,
        mensagem: `O estoque dos itens será baixado e as contas a receber serão geradas: ${resumoDasParcelas()}.`,
        textoConfirmar: "Confirmar pedido",
        perigo: false,
        sucesso: `Pedido ${numero} confirmado.`
      };
    } else if (pedido.status === "aberto") {
      config = {
        titulo: `Cancelar o pedido ${numero}?`,
        mensagem: "A reserva de estoque dos itens será liberada. Esta ação não pode ser desfeita.",
        textoConfirmar: "Cancelar pedido",
        perigo: true,
        sucesso: `Pedido ${numero} cancelado.`
      };
    } else {
      config = {
        titulo: `Cancelar o pedido ${numero}?`,
        mensagem: "O estoque dos itens volta ao saldo e as contas a receber deste pedido serão canceladas. " +
          "Só é possível se nenhuma parcela tiver recebimento lançado. Esta ação não pode ser desfeita.",
        textoConfirmar: "Cancelar pedido",
        perigo: true,
        sucesso: `Pedido ${numero} cancelado.`
      };
    }

    const confirmou = await confirmarAcao({
      titulo: config.titulo,
      mensagem: config.mensagem,
      textoConfirmar: config.textoConfirmar,
      textoCancelar: "Voltar",
      perigo: config.perigo
    });
    if (!confirmou) return;

    definirOcupado(true);
    try {
      pedido = await pedidoVendaService.atualizarStatus(pedido.id, novoStatus);
      await carregarTitulos();
      renderizarPedido();
      toast.sucesso(config.sucesso);
    } catch (erro) {
      toast.erro(erro.message);
      // O status pode ter mudado em outra aba/usuário: mostra o estado atual real.
      try {
        pedido = await pedidoVendaService.buscarPorId(pedido.id);
        await carregarTitulos();
        renderizarPedido();
      } catch (e) {
        definirOcupado(false);
      }
    }
  }

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
      const blob = await pedidoVendaService.baixarPdf(pedido.id);
      const url = URL.createObjectURL(blob);
      if (aba) aba.location.href = url;
      else baixarArquivo(url, `pedido-venda-${pedido.id}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (erro) {
      if (aba) aba.close();
      toast.erro(erro.message);
    } finally {
      el.botaoPdf.disabled = false;
    }
  }

  el.botaoConfirmar.addEventListener("click", () => mudarStatus("confirmado"));
  el.botaoCancelar.addEventListener("click", () => mudarStatus("cancelado"));
  el.botaoPdf.addEventListener("click", abrirPdf);

  // ---------- Carga ----------

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    mostrarErroDePagina("Pedido não informado.");
    toast.erro("Pedido não informado.");
    return;
  }

  try {
    pedido = await pedidoVendaService.buscarPorId(pedidoId);
  } catch (erro) {
    mostrarErroDePagina(erro.status === 404 ? "Pedido de venda não encontrado." : "Não foi possível carregar o pedido.");
    toast.erro(erro.message);
    return;
  }

  // O restante só enriquece a tela (nomes, unidades, parcelas). Se algo falhar, o pedido aparece com o que já se tem.
  const [rCliente, rProdutos, rUnidades, rForma] = await Promise.allSettled([
    clienteService.buscarPorId(pedido.cliente_id),
    produtoService.listar({ incluirInativos: true }),
    unidadeMedidaService.listar({ incluirInativos: true }),
    pedido.forma_pagamento_id ? formaPagamentoService.buscarPorId(pedido.forma_pagamento_id) : Promise.resolve(null)
  ]);
  cliente = rCliente.status === "fulfilled" ? rCliente.value : null;
  forma = rForma.status === "fulfilled" ? rForma.value : null;
  if (rProdutos.status === "fulfilled") produtosPorId = Object.fromEntries(rProdutos.value.map(p => [p.id, p]));
  if (rUnidades.status === "fulfilled") siglasPorUnidade = Object.fromEntries(rUnidades.value.map(u => [u.id, u.sigla]));

  await carregarTitulos();
  renderizarPedido();

  if (pedidoRecemCriado) {
    toast.sucesso(`Pedido ${numeroDoPedido()} criado. O estoque dos itens fica reservado até o pedido ser confirmado ou cancelado.`);
    history.replaceState(null, "", `pedido-venda-detalhe.html?id=${pedido.id}`);
  }
});
