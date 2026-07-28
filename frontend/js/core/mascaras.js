// Utilitário de máscara de moeda (formato brasileiro: 1.234,56).
// Reutilizado em qualquer tela que tenha campos de valor monetário
// (produtos, pedidos de compra/venda, cotações).

// Aplica a máscara em tempo real conforme o usuário digita.
// O input deve ser type="text" — nunca type="number", que não aceita
// caracteres de formatação como ponto e vírgula.
function aplicarMascaraMoeda(input) {
  input.addEventListener("input", () => {
    let valor = input.value.replace(/\D/g, ""); // mantém só dígitos

    if (!valor) {
      input.value = "";
      return;
    }

    valor = (parseInt(valor, 10) / 100).toFixed(2);
    input.value = valor
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  });
}

// Converte o valor mascarado ("1.234,56") para número puro (1234.56),
// pronto para enviar à API.
function moedaParaNumero(valorMascarado) {
  if (!valorMascarado) return null;
  const limpo = valorMascarado.replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(limpo);
  return isNaN(numero) ? null : numero;
}

// Converte um número puro vindo da API (1234.56) para o formato mascarado
// de exibição ("1.234,56"), usado ao preencher o formulário em modo de edição.
function numeroParaMoeda(numero) {
  if (numero == null) return "";
  return numero.toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}