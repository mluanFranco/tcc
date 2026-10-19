// Funções de apresentação dos títulos financeiros, usadas pela lista e pelo detalhe do Financeiro.
// Só montam texto a partir do que a API devolveu; nenhuma regra de negócio mora aqui.

function situacaoTitulo(titulo) {
  if (titulo.status === "cancelado") return { classe: "cancelado", texto: "Cancelado" };
  if (titulo.status === "pago") return { classe: "pago", texto: titulo.tipo === "receber" ? "Recebido" : "Pago" };
  if (titulo.vencido) return { classe: "vencido", texto: `Vencido (${titulo.dias_atraso} ${titulo.dias_atraso === 1 ? "dia" : "dias"})` };
  if (titulo.status === "parcial") return { classe: "parcial", texto: "Parcial" };
  return { classe: "aberto", texto: "Em aberto" };
}

function estaPendenteTitulo(titulo) {
  return titulo.status === "aberto" || titulo.status === "parcial";
}

// "Pedido de venda 00012" / "Pedido de compra 00007" / descrição do lançamento avulso.
function textoOrigemTitulo(titulo) {
  if (titulo.pedido_venda_id) return `Pedido de venda ${formatarNumeroPedido(titulo.pedido_venda_id)}`;
  if (titulo.pedido_compra_id) return `Pedido de compra ${formatarNumeroPedido(titulo.pedido_compra_id)}`;
  return titulo.descricao || "Lançamento avulso";
}

// Link da página do pedido de origem (ou null se for avulso ou o usuário não puder ver pedidos).
function linkOrigemTitulo(titulo) {
  if (titulo.pedido_venda_id && temPermissao("vendas.ver")) return `pedido-venda-detalhe.html?id=${titulo.pedido_venda_id}`;
  if (titulo.pedido_compra_id && temPermissao("compras.ver")) return `pedido-compra-detalhe.html?id=${titulo.pedido_compra_id}`;
  return null;
}

function nomeParteTitulo(titulo) {
  return titulo.tipo === "receber" ? titulo.cliente_nome : titulo.fornecedor_nome;
}

function rotuloTipoTitulo(tipo) {
  return tipo === "receber" ? "A receber" : "A pagar";
}

// "1/3" só quando há mais de uma parcela.
function textoParcelaTitulo(titulo) {
  return titulo.total_parcelas > 1 ? `${titulo.numero_parcela}/${titulo.total_parcelas}` : "";
}
