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

// 13911068 -> "13911-068"
function formatarCep(valor) {
  if (!valor) return "—";
  const d = String(valor).replace(/\D/g, "");
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : String(valor);
}
