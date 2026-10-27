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
// ---------- Máscaras de documento, telefone e CEP ----------
// Formatam enquanto o usuário digita. O backend aceita com ou sem pontuação
// (CPF/CNPJ e CEP são normalizados lá), então o valor mascarado pode ser enviado como está.

// Encaixa os caracteres no padrão ("#" = um caractere). A pontuação só entra quando
// há caractere depois dela, para o apagar funcionar normalmente.
function _encaixarNoPadrao(caracteres, padrao) {
  let saida = "";
  let i = 0;
  for (const p of padrao) {
    if (i >= caracteres.length) break;
    saida += p === "#" ? caracteres[i++] : p;
  }
  return saida;
}

// "12345678909" -> "123.456.789-09"
function mascararCpf(valor) {
  return _encaixarNoPadrao(String(valor ?? "").replace(/\D/g, "").slice(0, 11), "###.###.###-##");
}

// CNPJ numérico ou alfanumérico (novo formato): "12ABC34501DE35" -> "12.ABC.345/01DE-35"
function mascararCnpj(valor) {
  return _encaixarNoPadrao(String(valor ?? "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(0, 14), "##.###.###/####-##");
}

// "19999998888" -> "(19) 99999-8888"; com 10 números (fixo) -> "(19) 3863-1234"
function mascararTelefone(valor) {
  const d = String(valor ?? "").replace(/\D/g, "").slice(0, 11);
  return _encaixarNoPadrao(d, d.length === 11 ? "(##) #####-####" : "(##) ####-####");
}

// "13970000" -> "13970-000"
function mascararCep(valor) {
  return _encaixarNoPadrao(String(valor ?? "").replace(/\D/g, "").slice(0, 8), "#####-###");
}

// Só números (ex.: DDD).
function mascararNumeros(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// Liga uma das máscaras acima a um input. O cursor fica no mesmo ponto
// (conta letras/números antes dele), então dá para corrigir no meio do texto.
// `formatar` pode ser trocada em tempo de execução, ex.: CPF ou CNPJ conforme o tipo.
function aplicarMascara(input, formatar) {
  input.addEventListener("input", () => {
    const valorAntes = input.value;
    const posicao = input.selectionStart ?? valorAntes.length;
    const novoValor = formatar(valorAntes);
    if (novoValor === valorAntes) return;
    const significativosAntes = valorAntes.slice(0, posicao).replace(/[^0-9a-zA-Z]/g, "").length;
    input.value = novoValor;
    if (document.activeElement !== input) return;
    let novaPosicao = 0;
    let contados = 0;
    while (novaPosicao < novoValor.length && contados < significativosAntes) {
      if (/[0-9a-zA-Z]/.test(novoValor[novaPosicao])) contados++;
      novaPosicao++;
    }
    input.setSelectionRange(novaPosicao, novaPosicao);
  });
}
