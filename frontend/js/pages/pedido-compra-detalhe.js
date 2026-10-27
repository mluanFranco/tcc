// Detalhe do Pedido de Compra.
// O pedido não é editado depois de criado: ele recebe mercadoria (parcial ou total) ou é cancelado.
//  - Cada recebimento soma ao estoque só a quantidade informada; quando todos os itens chegam por completo,
//    o backend muda o pedido para "recebido" sozinho;
//  - Cancelar devolve do estoque o que já foi recebido e cancela as contas a pagar. O backend recusa se essa
//    mercadoria já foi vendida/reservada ou se alguma parcela já tiver pagamento lançado.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("compras.ver")) return;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = Number(params.get("id"));
  const pedidoRecemCriado = params.get("novo") === "1";

  const podeEditar = temPermissao("compras.editar");
  const podeVerFinanceiro = temPermissao("financeiro.ver");

  const el = {
    estadoPagina: document.getElementById("estado-pagina"),
    conteudo: document.getElementById("conteudo-pedido"),
    titulo: document.getElementById("titulo-pedido"),
    pilula: document.getElementById("pilula-status"),
    pilulaAtrasado: document.getElementById("pilula-atrasado"),
    botaoPdf: document.getElementById("botao-pdf"),
    botaoReceber: document.getElementById("botao-receber"),
    botaoCancelar: document.getElementById("botao-cancelar-pedido"),
    fornecedor: document.getElementById("vis-fornecedor"),
    forma: document.getElementById("vis-forma"),
    data: document.getElementById("vis-data"),
    entrega: document.getElementById("vis-entrega"),
    observacao: document.getElementById("vis-observacao"),
    itensCorpo: document.getElementById("itens-corpo"),
    total: document.getElementById("total-exibicao"),
    cartaoTitulos: document.getElementById("cartao-titulos"),
    titulosCorpo: document.getElementById("titulos-corpo"),
    notaTitulos: document.getElementById("nota-titulos"),
    modal: document.getElementById("modal-recebimento"),
    modalFechar: document.getElementById("modal-recebimento-fechar"),
    modalCancelar: document.getElementById("modal-recebimento-cancelar"),
    modalConfirmar: document.getElementById("modal-recebimento-confirmar"),
    formRecebimento: document.getElementById("form-recebimento"),
    recebimentoCorpo: document.getElementById("recebimento-corpo"),
    botaoReceberTudo: document.getElementById("botao-receber-tudo")
  };

  let pedido = null;
  let fornecedor = null;
  let forma = null;
  let titulos = [];
  let produtosPorId = {};
  let siglasPorUnidade = {};
  let ocupado = false;
  let enviandoRecebimento = false;

  const numeroDoPedido = () => formatarNumeroPedido(pedido.id);
  // Quantidades têm até 3 casas: compara em milésimos (inteiros) para não errar por ponto flutuante.
  const milesimos = (n) => Math.round((Number(n) || 0) * 1000);
  const restanteMil = (item) => Math.max(0, milesimos(item.quantidade) - milesimos(item.quantidade_recebida));
  const nomeDoProduto = (item) => produtosPorId[item.produto_id]?.nome ?? `Produto #${item.produto_id}`;
  // Quantidades do item estão na embalagem do produto; o fator gravado no item converte para a unidade base.
  const comSigla = (valor, item) => textoQuantidadeItem(valor, item.fator, produtosPorId[item.produto_id], siglasPorUnidade);

  function mostrarErroDePagina(mensagem) {
    el.estadoPagina.textContent = mensagem;
    el.estadoPagina.hidden = false;
    el.conteudo.hidden = true;
  }

  // ---------- Desenho ----------

  function renderizarItens() {
    el.itensCorpo.innerHTML = pedido.itens.slice().sort((a, b) => a.id - b.id).map(item => {
      const pedidoMil = milesimos(item.quantidade);
      const recebidoMil = milesimos(item.quantidade_recebida);
      const percentual = pedidoMil > 0 ? Math.min(100, Math.round((recebidoMil / pedidoMil) * 100)) : 0;
      const completo = recebidoMil >= pedidoMil;
      return `
        <tr>
          <td>${escaparHtml(nomeDoProduto(item))}</td>
          <td class="num">${escaparHtml(comSigla(item.quantidade, item))}</td>
          <td class="num">
            <div class="progresso-recebimento">
              <span>${escaparHtml(formatarNumero(item.quantidade_recebida))} de ${escaparHtml(comSigla(item.quantidade, item))}</span>
              <div class="progresso-recebimento__barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentual}">
                <div class="progresso-recebimento__preenchido${completo ? "" : " progresso-recebimento__preenchido--parcial"}" style="width:${percentual}%"></div>
              </div>
            </div>
          </td>
          <td class="num">${formatarMoeda(item.preco_unitario)}</td>
          <td class="num subtotal">${formatarMoeda(item.subtotal)}</td>
        </tr>`;
    }).join("");
    el.total.textContent = formatarMoeda(pedido.valor_total);
  }

  function rotuloSituacao(titulo) {
    if (titulo.status === "cancelado") return { classe: "cancelado", texto: "Cancelado" };
    if (titulo.status === "pago") return { classe: "pago", texto: "Pago" };
    if (titulo.vencido) return { classe: "vencido", texto: `Vencido (${titulo.dias_atraso} ${titulo.dias_atraso === 1 ? "dia" : "dias"})` };
    if (titulo.status === "parcial") return { classe: "parcial", texto: "Parcial" };
    return { classe: "aberto", texto: "Em aberto" };
  }

  function renderizarTitulos() {
    // Quem não tem financeiro.ver não vê o cartão. Ao contrário da venda, as contas existem desde a criação.
    el.cartaoTitulos.hidden = !podeVerFinanceiro;
    if (!podeVerFinanceiro) return;

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

    el.notaTitulos.textContent = titulos.length === 0 ? "Nenhuma conta a pagar encontrada para este pedido." : "";
    el.notaTitulos.hidden = titulos.length !== 0;
  }

  function renderizarPedido() {
    const situacao = situacaoPedidoCompra(pedido);

    el.titulo.textContent = `Pedido: ${numeroDoPedido()}`;
    el.pilula.textContent = situacao.rotulo;
    el.pilula.className = `pilula-status pilula-status--${situacao.chave}`;
    el.pilulaAtrasado.hidden = !situacao.atrasado;

    el.fornecedor.textContent = fornecedor
      ? (fornecedor.cnpj ? `${fornecedor.nome} (${formatarDocumento(fornecedor.cnpj)})` : fornecedor.nome)
      : `Fornecedor #${pedido.fornecedor_id}`;
    el.forma.textContent = forma ? forma.descricao : "—";
    el.data.textContent = formatarDataHora(pedido.data_pedido);
    el.entrega.textContent = formatarData(pedido.data_entrega_prevista);
    el.observacao.textContent = pedido.observacao || "—";

    renderizarItens();
    renderizarTitulos();

    el.botaoReceber.hidden = !(podeEditar && pedido.status === "pendente");
    el.botaoCancelar.hidden = !(podeEditar && pedido.status !== "cancelado");
    definirOcupado(false);

    el.estadoPagina.hidden = true;
    el.conteudo.hidden = false;
    document.title = `Pedido ${numeroDoPedido()} — Nova Sorvetes`;
  }

  function definirOcupado(valor) {
    ocupado = valor;
    el.botaoReceber.disabled = valor;
    el.botaoCancelar.disabled = valor;
  }

  async function carregarTitulos() {
    if (!podeVerFinanceiro) {
      titulos = [];
      return;
    }
    try {
      titulos = await pedidoCompraService.listarTitulos(pedido.id);
    } catch (erro) {
      titulos = [];
      toast.erro(`Não foi possível carregar as contas a pagar. ${erro.message}`);
    }
  }

  // Depois de um erro, mostra o estado real (o pedido pode ter mudado em outra aba/usuário).
  async function recarregarPedido() {
    try {
      pedido = await pedidoCompraService.buscarPorId(pedido.id);
      await carregarTitulos();
      renderizarPedido();
    } catch (e) {
      definirOcupado(false);
    }
  }

  // ---------- Recebimento ----------

  function abrirModalRecebimento() {
    if (ocupado || pedido.status !== "pendente") return;
    const pendentes = pedido.itens.slice().sort((a, b) => a.id - b.id).filter(i => restanteMil(i) > 0);
    if (pendentes.length === 0) {
      toast.info("Todos os itens deste pedido já foram recebidos.");
      return;
    }

    el.recebimentoCorpo.innerHTML = pendentes.map(item => `
      <tr data-item-id="${item.id}" data-restante="${restanteMil(item)}">
        <td>${escaparHtml(nomeDoProduto(item))}</td>
        <td class="num">${escaparHtml(comSigla(item.quantidade, item))}</td>
        <td class="num">${escaparHtml(comSigla(item.quantidade_recebida, item))}</td>
        <td class="num">${escaparHtml(comSigla(restanteMil(item) / 1000, item))}</td>
        <td class="num">
          <input type="number" min="0" step="0.001" inputmode="decimal" placeholder="0" aria-label="Quantidade recebida agora de ${escaparHtml(nomeDoProduto(item))}">
          <span class="item-aviso" hidden></span>
        </td>
      </tr>`).join("");

    el.modalConfirmar.disabled = false;
    el.modalConfirmar.textContent = "Confirmar recebimento";
    el.modal.classList.add("aberto");
    const primeiro = el.recebimentoCorpo.querySelector("input");
    if (primeiro) primeiro.focus();
  }

  function fecharModalRecebimento() {
    if (enviandoRecebimento) return;
    el.modal.classList.remove("aberto");
  }

  function receberTudo() {
    el.recebimentoCorpo.querySelectorAll("tr[data-item-id]").forEach(tr => {
      const input = tr.querySelector("input");
      input.value = String(Number(tr.dataset.restante) / 1000);
      input.classList.remove("campo-invalido");
      const aviso = tr.querySelector(".item-aviso");
      aviso.hidden = true;
    });
  }

  // Valida linha a linha e devolve só as entregas com quantidade > 0.
  function lerRecebimento() {
    const entregas = [];
    let primeiroInvalido = null;

    el.recebimentoCorpo.querySelectorAll("tr[data-item-id]").forEach(tr => {
      const input = tr.querySelector("input");
      const aviso = tr.querySelector(".item-aviso");
      const texto = input.value.trim();
      let erro = "";

      if (texto !== "") {
        const valor = Number(texto);
        const mil = Math.round(valor * 1000);
        if (!(valor >= 0)) erro = "Informe um número válido.";
        else if (Math.abs(valor * 1000 - mil) > 1e-6) erro = "No máximo 3 casas decimais.";
        else if (mil > Number(tr.dataset.restante)) erro = `Maior que o que falta (${formatarNumero(Number(tr.dataset.restante) / 1000)}).`;
        else if (mil > 0) entregas.push({ item_id: Number(tr.dataset.itemId), quantidade_recebida_agora: mil / 1000 });
      }

      aviso.textContent = erro;
      aviso.hidden = !erro;
      input.classList.toggle("campo-invalido", Boolean(erro));
      if (erro && !primeiroInvalido) primeiroInvalido = input;
    });

    return { entregas, primeiroInvalido };
  }

  async function enviarRecebimento(evento) {
    evento.preventDefault();
    if (enviandoRecebimento) return;

    const { entregas, primeiroInvalido } = lerRecebimento();
    if (primeiroInvalido) {
      toast.erro("Corrija as quantidades destacadas.");
      primeiroInvalido.focus();
      return;
    }
    if (entregas.length === 0) {
      toast.erro("Informe a quantidade recebida de pelo menos um item.");
      const primeiro = el.recebimentoCorpo.querySelector("input");
      if (primeiro) primeiro.focus();
      return;
    }

    enviandoRecebimento = true;
    el.modalConfirmar.disabled = true;
    el.modalConfirmar.textContent = "Registrando...";
    definirOcupado(true);

    try {
      pedido = await pedidoCompraService.registrarRecebimento(pedido.id, entregas);
      enviandoRecebimento = false;
      el.modal.classList.remove("aberto");
      await carregarTitulos();
      renderizarPedido();
      toast.sucesso(pedido.status === "recebido"
        ? `Pedido ${numeroDoPedido()} totalmente recebido. Estoque atualizado.`
        : "Recebimento registrado. Estoque atualizado; o restante continua pendente.");
    } catch (erro) {
      enviandoRecebimento = false;
      el.modalConfirmar.disabled = false;
      el.modalConfirmar.textContent = "Confirmar recebimento";
      toast.erro(erro.message);
      // Se o pedido mudou por fora (cancelado, já recebido), fecha o modal e mostra o estado real.
      try {
        const atual = await pedidoCompraService.buscarPorId(pedido.id);
        const mudou = atual.status !== "pendente" ||
          JSON.stringify(atual.itens.map(i => i.quantidade_recebida)) !== JSON.stringify(pedido.itens.map(i => i.quantidade_recebida));
        if (mudou) {
          el.modal.classList.remove("aberto");
          await recarregarPedido();
        } else {
          definirOcupado(false);
        }
      } catch (e) {
        definirOcupado(false);
      }
    }
  }

  // ---------- Cancelamento ----------

  async function cancelarPedido() {
    if (ocupado) return;
    const numero = numeroDoPedido();
    const houveRecebimento = pedido.itens.some(i => milesimos(i.quantidade_recebida) > 0);

    let mensagem = "As contas a pagar deste pedido serão canceladas, desde que nenhuma parcela tenha pagamento lançado.";
    if (houveRecebimento) {
      mensagem += " O que já foi recebido sai do estoque, desde que não tenha sido vendido nem reservado.";
    }
    mensagem += " Esta ação não pode ser desfeita.";

    const confirmou = await confirmarAcao({
      titulo: `Cancelar o pedido ${numero}?`,
      mensagem,
      textoConfirmar: "Cancelar pedido",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!confirmou) return;

    definirOcupado(true);
    try {
      pedido = await pedidoCompraService.cancelar(pedido.id);
      await carregarTitulos();
      renderizarPedido();
      toast.sucesso(`Pedido ${numero} cancelado.`);
    } catch (erro) {
      toast.erro(erro.message);
      await recarregarPedido();
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
      const blob = await pedidoCompraService.baixarPdf(pedido.id);
      const url = URL.createObjectURL(blob);
      if (aba) aba.location.href = url;
      else baixarArquivo(url, `pedido-compra-${pedido.id}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (erro) {
      if (aba) aba.close();
      toast.erro(erro.message);
    } finally {
      el.botaoPdf.disabled = false;
    }
  }

  // ---------- Eventos ----------

  el.botaoReceber.addEventListener("click", abrirModalRecebimento);
  el.botaoCancelar.addEventListener("click", cancelarPedido);
  el.botaoPdf.addEventListener("click", abrirPdf);

  el.botaoReceberTudo.addEventListener("click", receberTudo);
  el.formRecebimento.addEventListener("submit", enviarRecebimento);
  el.modalFechar.addEventListener("click", fecharModalRecebimento);
  el.modalCancelar.addEventListener("click", fecharModalRecebimento);
  el.modal.addEventListener("click", (e) => { if (e.target === el.modal) fecharModalRecebimento(); });
  document.addEventListener("keydown", (e) => {
    // O Esc do modal não deve disputar com a janela de confirmação, que tem o seu próprio.
    if (e.key === "Escape" && el.modal.classList.contains("aberto") && !document.querySelector(".confirmacao-overlay")) {
      fecharModalRecebimento();
    }
  });
  el.recebimentoCorpo.addEventListener("input", (e) => {
    const input = e.target.closest("input");
    if (!input) return;
    input.classList.remove("campo-invalido");
    const aviso = input.closest("td").querySelector(".item-aviso");
    aviso.hidden = true;
  });

  // ---------- Carga ----------

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    mostrarErroDePagina("Pedido não informado.");
    toast.erro("Pedido não informado.");
    return;
  }

  try {
    pedido = await pedidoCompraService.buscarPorId(pedidoId);
  } catch (erro) {
    mostrarErroDePagina(erro.status === 404 ? "Pedido de compra não encontrado." : "Não foi possível carregar o pedido.");
    toast.erro(erro.message);
    return;
  }

  // O restante só enriquece a tela (nomes, unidades, forma). Se algo falhar, o pedido aparece com o que já se tem.
  const [rFornecedor, rProdutos, rUnidades, rForma] = await Promise.allSettled([
    fornecedorService.buscarPorId(pedido.fornecedor_id),
    produtoService.listar({ incluirInativos: true }),
    unidadeMedidaService.listar({ incluirInativos: true }),
    pedido.forma_pagamento_id ? formaPagamentoService.buscarPorId(pedido.forma_pagamento_id) : Promise.resolve(null)
  ]);
  fornecedor = rFornecedor.status === "fulfilled" ? rFornecedor.value : null;
  forma = rForma.status === "fulfilled" ? rForma.value : null;
  if (rProdutos.status === "fulfilled") produtosPorId = Object.fromEntries(rProdutos.value.map(p => [p.id, p]));
  if (rUnidades.status === "fulfilled") siglasPorUnidade = Object.fromEntries(rUnidades.value.map(u => [u.id, u.sigla]));

  await carregarTitulos();
  renderizarPedido();

  if (pedidoRecemCriado) {
    toast.sucesso(`Pedido ${numeroDoPedido()} criado. As contas a pagar já foram geradas; o estoque só aumenta quando o recebimento for registrado.`);
    history.replaceState(null, "", `pedido-compra-detalhe.html?id=${pedido.id}`);
  }
});
