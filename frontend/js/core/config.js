// Configuração central da aplicação.
// A API fica na porta 8000 do MESMO endereço em que o frontend foi aberto: funciona em
// localhost, no Docker (frontend :8080 + API :8000), no Live Server (:5500) e em outra máquina da rede.
// Se a API for publicada em outro endereço/porta, é só este valor que muda.

const CONFIG = {
  API_BASE_URL: `${window.location.protocol === "file:" ? "http:" : window.location.protocol}//${window.location.hostname || "127.0.0.1"}:8000`
};
