// Service do Assistente de IA — única camada que conversa com os endpoints /assistente.
// Nenhuma lógica de UI deve existir aqui, apenas chamadas à API.

const assistenteService = {
  // { habilitado, modelo, modo_privado, banco_configurado, limite_por_hora, restantes_na_hora }
  async status() {
    return apiFetch("/assistente/status");
  },

  // Sem conversaId, abre uma conversa nova. Resposta: { conversa_id, mensagem_id, resposta, tabela, consultas, restantes_na_hora }.
  // Pode demorar vários segundos (a IA consulta os dados e escreve a resposta).
  async perguntar({ texto, conversaId = null }) {
    return apiFetch("/assistente/mensagens", {
      method: "POST",
      body: JSON.stringify({ conversa_id: conversaId, texto })
    });
  },

  async listarConversas({ limite = 50 } = {}) {
    return apiFetch(`/assistente/conversas?limite=${limite}`);
  },

  // { id, titulo, mensagens: [{ id, papel: "usuario"|"assistente", conteudo, tabela, consultas, created_at }] }
  async buscarConversa(id) {
    return apiFetch(`/assistente/conversas/${id}`);
  },

  async excluirConversa(id) {
    return apiFetch(`/assistente/conversas/${id}`, { method: "DELETE" });
  }
};
