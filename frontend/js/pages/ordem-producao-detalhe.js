// Detalhe da Ordem de Produção: leitura, confirmar e cancelar.
//
// Status (o backend impõe; a tela só mostra o que cabe):
//   aberta → confirmada | cancelada      confirmada → cancelada
// - ABERTA: os insumos já estão RESERVADOS (quantidades congeladas na criação). O custo mostrado é prévia.
//   Não usa a simulação da receita: ela desconta o reservado e acusaria falta por causa da própria reserva.
// - Confirmar: consome o que foi reservado, dá entrada no produto fabricado e GRAVA o custo real.
// - Cancelar aberta: libera a reserva.
// - Cancelar confirmada: devolve os insumos (pelas quantidades gravadas) e retira o fabricado; o servidor recusa
//   se o produto já foi vendido ou reservado.

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("producao.ver")) return;

  const params = new URLSearchParams(window.location.search);
  const ordemId = Number(params.get("id"));
  const recemCriada = params.get("novo") === "1";

  const podeEditar = temPermissao("producao.editar");

  const $ = (id) => document.getElementById(id);
  const el = {
    estadoPagina: $("estado-pagina"), conteudo: $("conteudo-ordem"), titulo: $("titulo-ordem"),
    pilulaStatus: $("pilula-status"), faixaAviso: $("faixa-aviso"),
    botaoConfirmar: $("botao-confirmar"), botaoCancelar: $("botao-cancelar"),
    produto: $("vis-produto"), quantidade: $("vis-quantidade"), usuario: $("vis-usuario"),
    historico: $("vis-historico"), observacao: $("vis-observacao"),
    tituloInsumos: $("titulo-insumos"), insumos: $("insumos"), notaInsumos: $("nota-insumos")
  };

  const ROTULOS = { aberta: "Aberta", confirmada: "Confirmada", cancelada: "Cancelada" };

  let ordem = null;
  let ocupado = false;

  const numero = () => formatarNumeroPedido(ordem.id);
  const sigla = () => (ordem.unidade_sigla ? " " + ordem.unidade_sigla : "");
  const textoQuantidade = () => `${formatarNumero(ordem.quantidade)}${sigla()}`;

  function mostrarErroDePagina(mensagem) {
    el.estadoPagina.textContent = mensagem;
    el.estadoPagina.hidden = false;
    el.conteudo.hidden = true;
  }

  // ---------- Desenho ----------

  function tabelaDeItens() {
    const linhas = ordem.itens.map(i => `
      <tr>
        <td>${escaparHtml(i.produto_nome)}</td>
        <td class="num">${formatarNumero(i.quantidade)}${i.unidade_sigla ? " " + escaparHtml(i.unidade_sigla) : ""}</td>
        <td class="num">${formatarMoeda(i.custo_unitario)}</td>
        <td class="num subtotal">${formatarMoeda(i.subtotal)}</td>
      </tr>`).join("");
    return `
      <table class="tabela-itens-leitura">
        <thead><tr><th>Insumo</th><th class="num">Quantidade</th><th class="num">R$ Un.</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;
  }

  function blocoDeCustos(totalRotulo, total, unitario) {
    return `
      <div class="resumo-custos">
        <div class="resumo-custos__bloco">
          <span class="resumo-custos__rotulo">${totalRotulo}</span>
          <span class="resumo-custos__valor">${formatarMoeda(total)}</span>
        </div>
        <div class="resumo-custos__bloco">
          <span class="resumo-custos__rotulo">Custo por ${escaparHtml(ordem.unidade_sigla || "unidade")}</span>
          <span class="resumo-custos__valor resumo-custos__valor--secundario">${formatarMoeda(unitario)}</span>
        </div>
      </div>`;
  }

  function renderizarInsumos() {
    if (ordem.status === "aberta") {
      el.tituloInsumos.textContent = "Insumos reservados";
      const total = ordem.itens.reduce((s, i) => s + Number(i.subtotal || 0), 0);
      el.insumos.innerHTML = tabelaDeItens() + blocoDeCustos("Custo estimado", Math.round(total * 100) / 100, Math.round(total / Number(ordem.quantidade) * 100) / 100);
      el.notaInsumos.textContent = "Estas quantidades já estão reservadas no estoque (não podem ser usadas por outra ordem ou venda) e serão consumidas na confirmação. O custo é uma prévia: o real é gravado quando a produção é confirmada. Cancelar a ordem libera a reserva.";
      el.notaInsumos.hidden = false;
      return;
    }

    el.tituloInsumos.textContent = ordem.status === "confirmada" ? "Insumos consumidos" : "Insumos";
    if (ordem.itens.length === 0) {
      el.insumos.innerHTML = '<div class="simulacao-vazia">Nenhum insumo foi consumido: a ordem foi cancelada antes de ser confirmada.</div>';
      el.notaInsumos.hidden = true;
      return;
    }
    el.insumos.innerHTML = tabelaDeItens() + blocoDeCustos("Custo total", ordem.custo_total, ordem.custo_unitario);
    el.notaInsumos.textContent = ordem.status === "cancelada"
      ? "Ordem cancelada depois de confirmada: os insumos foram devolvidos ao estoque e o produto fabricado foi retirado."
      : "Consumo e custo gravados na confirmação, com o custo cadastrado dos insumos naquele momento.";
    el.notaInsumos.hidden = false;
  }

  function renderizarOrdem() {
    el.titulo.textContent = `Ordem de Produção: ${numero()}`;
    el.pilulaStatus.textContent = ROTULOS[ordem.status] || ordem.status;
    el.pilulaStatus.className = `pilula-status pilula-status--${ordem.status}`;

    el.produto.innerHTML = `${escaparHtml(ordem.produto_nome)} — <a class="link-pedido" href="receita-detalhe.html?id=${ordem.receita_id}">ver receita</a>`;
    el.quantidade.textContent = textoQuantidade();
    el.usuario.textContent = ordem.usuario_nome || `Usuário #${ordem.usuario_id}`;
    const linhas = [`Criada em ${formatarDataHora(ordem.created_at)}`];
    if (ordem.confirmada_em) linhas.push(`Confirmada em ${formatarDataHora(ordem.confirmada_em)}`);
    if (ordem.cancelada_em) linhas.push(`Cancelada em ${formatarDataHora(ordem.cancelada_em)}`);
    el.historico.innerHTML = linhas.map(l => `<span>${escaparHtml(l)}</span>`).join("");
    el.observacao.textContent = ordem.observacao || "—";

    renderizarInsumos();

    el.faixaAviso.hidden = true;

    document.title = `Ordem de Produção ${numero()} — Nova Sorvetes`;
    el.estadoPagina.hidden = true;
    el.conteudo.hidden = false;
    atualizarBotoes();
  }

  function atualizarBotoes() {
    el.botaoConfirmar.hidden = !(podeEditar && ordem.status === "aberta");
    el.botaoCancelar.hidden = !(podeEditar && (ordem.status === "aberta" || ordem.status === "confirmada"));
    el.botaoConfirmar.disabled = ocupado;
    el.botaoCancelar.disabled = ocupado;
  }

  function definirOcupado(valor) {
    ocupado = valor;
    atualizarBotoes();
  }

  // ---------- Dados ----------

  async function recarregar() {
    try {
      ordem = await ordemProducaoService.buscarPorId(ordem.id);
      renderizarOrdem();
    } catch (erro) {
      toast.erro(erro.message);
    }
  }

  // ---------- Ações ----------

  async function confirmar() {
    if (ocupado) return;
    definirOcupado(true);

    // os insumos já estão reservados: a confirmação consome exatamente essas quantidades
    const consumo = ordem.itens.length
      ? ordem.itens.map(i => `${formatarNumero(i.quantidade)}${i.unidade_sigla ? " " + i.unidade_sigla : ""} de ${i.produto_nome}`).join("; ")
      : "os insumos reservados";
    const confirmou = await confirmarAcao({
      titulo: `Confirmar a produção ${numero()}?`,
      mensagem: `Serão consumidos os insumos reservados: ${consumo}. Entrarão no estoque ${textoQuantidade()} de ${ordem.produto_nome}. O custo real será gravado na ordem.`,
      textoConfirmar: "Confirmar produção",
      textoCancelar: "Voltar"
    });
    if (!confirmou) { definirOcupado(false); return; }

    try {
      ordem = await ordemProducaoService.atualizarStatus(ordem.id, "confirmada");
      renderizarOrdem();
      definirOcupado(false);
      toast.sucesso(`Produção ${numero()} confirmada: ${textoQuantidade()} de ${ordem.produto_nome} no estoque.`);
    } catch (erro) {
      toast.erro(erro.message);
      await recarregar();   // o estoque ou o status podem ter mudado em outra aba/usuário
      definirOcupado(false);
    }
  }

  async function cancelar() {
    if (ocupado) return;
    const estavaConfirmada = ordem.status === "confirmada";
    const confirmou = await confirmarAcao({
      titulo: `Cancelar a ordem ${numero()}?`,
      mensagem: estavaConfirmada
        ? `Os insumos consumidos voltarão ao estoque e ${textoQuantidade()} de ${ordem.produto_nome} serão retirados. Só é possível se esse produto ainda estiver disponível (não vendido nem reservado).`
        : "A reserva dos insumos será liberada e a ordem ficará como cancelada; ela não poderá mais ser confirmada.",
      textoConfirmar: "Cancelar ordem",
      textoCancelar: "Voltar",
      perigo: true
    });
    if (!confirmou) return;

    definirOcupado(true);
    try {
      ordem = await ordemProducaoService.atualizarStatus(ordem.id, "cancelada");
      renderizarOrdem();
      definirOcupado(false);
      toast.sucesso(estavaConfirmada ? `Ordem ${numero()} cancelada e estoque revertido.` : `Ordem ${numero()} cancelada e reserva liberada.`);
    } catch (erro) {
      toast.erro(erro.message);
      await recarregar();
      definirOcupado(false);
    }
  }

  el.botaoConfirmar.addEventListener("click", confirmar);
  el.botaoCancelar.addEventListener("click", cancelar);

  // ---------- Carga ----------

  if (!Number.isInteger(ordemId) || ordemId <= 0) {
    mostrarErroDePagina("Ordem de produção não informada.");
    toast.erro("Ordem de produção não informada.");
    return;
  }

  try {
    ordem = await ordemProducaoService.buscarPorId(ordemId);
  } catch (erro) {
    mostrarErroDePagina(erro.status === 404 ? "Ordem de produção não encontrada." : "Não foi possível carregar a ordem de produção.");
    toast.erro(erro.message);
    return;
  }

  renderizarOrdem();

  if (recemCriada) {
    toast.sucesso(`Ordem de produção ${numero()} criada: insumos reservados.`);
    history.replaceState(null, "", `ordem-producao-detalhe.html?id=${ordem.id}`);
  }
});
