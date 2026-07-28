// Service de integração com a API pública ViaCEP (viacep.com.br).
// Isolado dos demais services porque NÃO conversa com nosso backend —
// não usa apiFetch, não envia token JWT, é uma API externa e pública.

const viaCepService = {
  async buscarPorCep(cep) {
    const cepLimpo = cep.replace(/\D/g, "");

    if (cepLimpo.length !== 8) {
      return null;
    }

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      if (!resposta.ok) return null;

      const dados = await resposta.json();

      // ViaCEP retorna { erro: true } quando o CEP tem formato válido mas não existe
      if (dados.erro) return null;

      return {
        cep: dados.cep,
        logradouro: dados.logradouro,
        bairro: dados.bairro,
        cidade: dados.localidade,
        uf: dados.uf,
        ddd: dados.ddd
      };
    } catch {
      // Falha de rede ao consultar o ViaCEP não deve travar o cadastro —
      // o usuário pode preencher o endereço manualmente.
      return null;
    }
  }
};