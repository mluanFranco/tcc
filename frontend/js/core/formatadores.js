// Formatadores compartilhados: moeda, número, data e escape de HTML.
// Use sempre escaparHtml() ao montar HTML com texto vindo da API (nomes, descrições...).

const _fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const _fmtNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

// 1234.5 -> "R$ 1.234,50". Valores nulos viram "—".
function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) return "—";
  return _fmtMoeda.format(Number(valor)).replace(/ /g, " ");
}

// 1234.5 -> "1.234,5". Usado em quantidades e estoques.
function formatarNumero(valor) {
  if (valor === null || valor === undefined || valor === "" || isNaN(Number(valor))) return "—";
  return _fmtNumero.format(Number(valor));
}

// "2026-09-20T10:30:00" ou "2026-09-20" -> "20/09/2026".
// Datas só com dia são tratadas sem fuso, para não recuarem um dia.
function formatarData(iso) {
  if (!iso) return "—";
  const texto = String(iso);
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;
  const data = new Date(texto);
  return isNaN(data) ? "—" : data.toLocaleDateString("pt-BR");
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  const data = new Date(String(iso));
  if (isNaN(data)) return "—";
  return data.toLocaleDateString("pt-BR") + " " + data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Evita que texto vindo do banco seja interpretado como HTML (XSS).
function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// 12345678909 -> "123.456.789-09"; CNPJ (numérico ou alfanumérico) -> "12.345.678/0001-95".
// Se não tiver 11 nem 14 caracteres, devolve o texto como veio.
function formatarDocumento(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const d = String(valor).replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  if (d.length === 11 && /^\d+$/.test(d)) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return String(valor);
}

// "19999998888" -> "(19) 99999-8888". Telefones gravados em outro formato aparecem como vieram.
function formatarTelefone(valor) {
  if (!valor) return "—";
  const d = String(valor).replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return String(valor);
}

// 13911068 -> "13911-068"
function formatarCep(valor) {
  if (!valor) return "—";
  const d = String(valor).replace(/\D/g, "");
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : String(valor);
}

// Endereço em uma linha: "Rua A, 10 — Sala 2 — Centro — Itapira/SP — CEP 13974-070". Aceita o objeto da API.
function formatarEndereco(e) {
  if (!e) return "—";
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
  const partes = [rua, e.complemento, e.bairro, cidadeUf, e.cep ? `CEP ${formatarCep(e.cep)}` : null].filter(Boolean);
  return partes.length ? partes.join(" — ") : "—";
}

// ---------- Embalagem do produto ----------
// Produto pode ter embalagem (ex.: Pote com fator 5 = 5 L). Pedidos e cotações são digitados na embalagem;
// estoque, estoque mínimo e receitas ficam na unidade base. A conversão de verdade é feita pelo backend.

function fatorEmbalagem(produto) {
  const f = Number(produto?.fator_embalagem);
  return f > 0 ? f : 1;
}

// Sigla em que o produto é negociado: a da embalagem, se houver; senão a da unidade base.
// `siglas` = { unidade_medida_id: "L" }.
function siglaNegociacao(produto, siglas) {
  if (!produto) return "";
  if (produto.embalagem_unidade_id && fatorEmbalagem(produto) !== 1) return siglas[produto.embalagem_unidade_id] || "emb.";
  return siglas[produto.unidade_medida_id] || "";
}

// Texto da quantidade de um item: "2 Pote (= 10 L)" com embalagem, "2 L" sem. Usa o fator gravado no item.
// Devolve texto puro: escape com escaparHtml() antes de pôr em innerHTML.
function textoQuantidadeItem(quantidade, fator, produto, siglas) {
  const f = Number(fator) || 1;
  const base = produto ? (siglas[produto.unidade_medida_id] || "") : "";
  const q = formatarNumero(quantidade);
  if (f === 1) return `${q}${base ? " " + base : ""}`;
  // o fator vem do item: mesmo que a embalagem tenha sido removida do cadastro depois, a conversão continua certa
  const emb = siglas[produto?.embalagem_unidade_id] || "emb.";
  return `${q} ${emb} (= ${formatarNumero(Math.round(Number(quantidade) * f * 1000) / 1000)}${base ? " " + base : ""})`;
}

// Quantidade na unidade base mostrada também em embalagens: "200 L (40 Pote)". Sem embalagem: "200 L".
function textoEstoque(quantidadeBase, produto, siglas) {
  const base = siglas[produto?.unidade_medida_id] || "";
  const texto = `${formatarNumero(quantidadeBase)}${base ? " " + base : ""}`;
  const f = fatorEmbalagem(produto);
  if (!produto?.embalagem_unidade_id || f === 1) return texto;
  return `${texto} (${formatarNumero(Math.round(Number(quantidadeBase) / f * 1000) / 1000)} ${siglas[produto.embalagem_unidade_id] || "emb."})`;
}

// 58 -> "00058" (o número do pedido nas telas e no protótipo tem 5 dígitos).
function formatarNumeroPedido(id) {
  return String(id ?? "").padStart(5, "0");
}

// Rótulo de tela para o status do pedido de venda.
function rotuloStatusPedido(status) {
  return { aberto: "Aberto", confirmado: "Confirmado", cancelado: "Cancelado" }[status] || String(status ?? "—");
}

// Situação de tela do pedido de COMPRA. O backend só guarda pendente | recebido | cancelado;
// "parcial" (pendente com algo já recebido) e "atrasado" (pendente com entrega prevista vencida) são derivados aqui.
//   -> { chave: "pendente|parcial|recebido|cancelado", rotulo: "Pendente|Parcial|...", atrasado: boolean }
function situacaoPedidoCompra(pedido) {
  const rotulos = { pendente: "Pendente", parcial: "Parcial", recebido: "Recebido", cancelado: "Cancelado" };
  let chave = pedido.status;
  let atrasado = false;
  if (pedido.status === "pendente") {
    if ((pedido.itens || []).some(i => Number(i.quantidade_recebida) > 0)) chave = "parcial";
    const hoje = new Date();
    const hojeTexto = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const previsto = pedido.data_entrega_prevista ? String(pedido.data_entrega_prevista).slice(0, 10) : "";
    atrasado = Boolean(previsto) && previsto < hojeTexto;
  }
  return { chave, rotulo: rotulos[chave] || String(pedido.status ?? "—"), atrasado };
}
