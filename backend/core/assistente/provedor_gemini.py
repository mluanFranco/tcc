"""Adaptador do Google Gemini (SDK google-genai). Ponto único que fala com a internet.
Chave gratuita do Google AI Studio: GEMINI_API_KEY no .env. Modelo principal em IA_MODELO e reservas em IA_MODELO_RESERVA (usadas quando o principal fica indisponível)."""
import re
import time
from typing import Any, List

from core.assistente import config
from core.assistente.provedor import (
    ChamadaFerramenta, ErroProvedor, Ferramenta, Resposta, Turno, TurnoChamadas, TurnoResultados, TurnoTexto, Uso,
)


ASSINATURA_PULAR_VALIDACAO = b"skip_thought_signature_validator"
ESPERA_MAXIMA = 25   # segundos: acima disso devolve o erro de cota em vez de segurar a requisição


class ProvedorGemini:
    def __init__(self, api_key: str = None, modelo: str = None, cliente: Any = None):
        from google import genai            # importado aqui: o sistema sobe mesmo sem a biblioteca instalada
        from google.genai import types
        self._types = types
        self.modelo = modelo or config.modelo()
        self.reservas = config.modelos_reserva()
        self._cliente = cliente or genai.Client(
            api_key=api_key or config.api_key(),
            http_options=types.HttpOptions(timeout=config.timeout_provedor_segundos() * 1000),
        )

    # ------------------------------------------------------------ conversão
    def _conteudos(self, turnos: List[Turno], com_bruto: bool = True, modelo: str = "") -> list:
        t = self._types
        saida = []
        for turno in turnos:
            if isinstance(turno, TurnoTexto):
                saida.append(t.Content(role="user" if turno.papel == "usuario" else "model", parts=[t.Part(text=turno.texto)]))
            elif isinstance(turno, TurnoChamadas):
                bruto = turno.resposta.bruto if com_bruto else None   # com outro modelo, as assinaturas de raciocínio do primeiro não valem
                if bruto is None:   # sem o objeto original, reconstrói a partir das chamadas
                    partes = [t.Part(function_call=t.FunctionCall(name=c.nome, args=c.args)) for c in turno.resposta.chamadas]
                    if modelo.startswith("gemini-3") and partes:
                        # a família 3 recusa (400) chamada de ferramenta sem assinatura; esta é a assinatura de "pular validação" prevista pelo Google
                        partes[0].thought_signature = ASSINATURA_PULAR_VALIDACAO
                    bruto = t.Content(role="model", parts=partes)
                saida.append(bruto)
            elif isinstance(turno, TurnoResultados):
                saida.append(t.Content(role="user", parts=[t.Part.from_function_response(name=c.nome, response=r) for c, r in turno.resultados]))
        return saida

    def _config(self, instrucao: str, ferramentas: List[Ferramenta], modelo: str):
        t = self._types
        kw = dict(
            system_instruction=instrucao,
            max_output_tokens=8192,    # nos modelos com "raciocínio", os tokens de raciocínio contam neste limite
            automatic_function_calling=t.AutomaticFunctionCallingConfig(disable=True),   # quem executa as ferramentas somos nós
        )
        if not modelo.startswith("gemini-3"):
            kw["temperature"] = 0.1    # a família 3 pede a temperatura padrão (1.0): valores baixos podem causar repetição
        else:
            kw["thinking_config"] = t.ThinkingConfig(thinking_level=config.raciocinio().upper())   # menos raciocínio = mais rápido
        if ferramentas:
            kw["tools"] = [t.Tool(function_declarations=[
                t.FunctionDeclaration(name=f.nome, description=f.descricao, parameters=f.parametros) for f in ferramentas
            ])]
        return t.GenerateContentConfig(**kw)

    # ------------------------------------------------------------ chamada
    def gerar(self, instrucao: str, turnos: List[Turno], ferramentas: List[Ferramenta]) -> Resposta:
        """Tenta o modelo principal (até 3 vezes em instabilidade). Se ele continuar fora do ar ou indisponível,
        passa pelos modelos de reserva (1 tentativa cada). Erros permanentes (chave inválida etc.) não trocam de modelo."""
        modelos = [self.modelo] + [m for m in self.reservas if m != self.modelo]
        primeiro = None
        falhas = []
        for i, modelo in enumerate(modelos):
            try:
                resposta = self._tentar(modelo, instrucao, turnos, ferramentas, tentativas=3 if i == 0 else 1, com_bruto=(i == 0))
                resposta.modelo = modelo
                resposta.trocas = list(falhas)
                return resposta
            except ErroProvedor as e:
                falhas.append(f"{modelo}: {e.detalhe or e.mensagem}")
                if i == 0:
                    primeiro = e
                    if not (e.temporario or e.indisponivel):
                        raise      # chave inválida, pedido recusado... outro modelo não resolve
        primeiro.detalhe = " | ".join(falhas)   # a causa verdadeira é a do principal; as reservas ficam no detalhe
        raise primeiro

    def _tentar(self, modelo: str, instrucao: str, turnos: List[Turno], ferramentas: List[Ferramenta], tentativas: int, com_bruto: bool) -> Resposta:
        conteudos, cfg = self._conteudos(turnos, com_bruto, modelo), self._config(instrucao, ferramentas, modelo)
        ultimo = None
        for tentativa in range(tentativas):
            try:
                resp = self._cliente.models.generate_content(model=modelo, contents=conteudos, config=cfg)
                return self._traduzir(resp)
            except ErroProvedor:
                raise
            except Exception as e:
                ultimo = self._erro_amigavel(e, modelo)
                ultimo.detalhe = f"{type(e).__name__}" + (f" (código {e.code})" if getattr(e, "code", None) else "")
                if getattr(e, "code", None) == 429:
                    # cota por minuto do plano gratuito: o Gemini diz em quantos segundos liberar; espera se for curto
                    espera = self._espera_sugerida(e)
                    if espera is not None and espera <= ESPERA_MAXIMA and tentativa < tentativas - 1:
                        time.sleep(espera + 1)
                        continue
                    break
                if not ultimo.temporario or tentativa == tentativas - 1:
                    break      # instabilidade (5xx/timeout): repete com espera crescente
                time.sleep(2 * (tentativa + 1))
        raise ultimo

    def _traduzir(self, resp: Any) -> Resposta:
        candidatos = getattr(resp, "candidates", None) or []
        if not candidatos or not getattr(candidatos[0], "content", None) or not getattr(candidatos[0].content, "parts", None):
            motivo = getattr(getattr(resp, "prompt_feedback", None), "block_reason", None)
            raise ErroProvedor("O modelo não devolveu resposta" + (" (conteúdo bloqueado)." if motivo else ". Tente reformular a pergunta."), temporario=False)
        partes = candidatos[0].content.parts
        texto = "".join(p.text for p in partes if getattr(p, "text", None) and not getattr(p, "thought", False)).strip()
        chamadas = [ChamadaFerramenta(nome=p.function_call.name, args=dict(p.function_call.args or {})) for p in partes if getattr(p, "function_call", None)]
        uso = getattr(resp, "usage_metadata", None)
        saida = getattr(uso, "response_token_count", None) or getattr(uso, "candidates_token_count", None) or 0
        return Resposta(texto=texto, chamadas=chamadas, bruto=candidatos[0].content,
                        uso=Uso(entrada=getattr(uso, "prompt_token_count", 0) or 0, saida=saida))

    @staticmethod
    def _espera_sugerida(e: Exception):
        """Segundos que o Gemini pede para esperar (RetryInfo/'retry in Ns'), ou None."""
        m = re.search(r"retry(?:Delay)?\D{0,12}?(\d+(?:\.\d+)?)\s*s", str(e), re.IGNORECASE)
        return float(m.group(1)) if m else None

    @staticmethod
    def _erro_amigavel(e: Exception, modelo: str = "") -> ErroProvedor:
        codigo = getattr(e, "code", None)
        texto = str(e).lower()
        if codigo in (401, 403) or "api key" in texto or "api_key" in texto or "permission" in texto:
            return ErroProvedor("A chave do Gemini foi recusada. Confira GEMINI_API_KEY no .env.", temporario=False)
        if codigo == 404 or "not found" in texto:
            erro = ErroProvedor(f"O modelo '{modelo}' não está disponível para a sua chave. Rode 'python scripts/testar_gemini.py --modelos' e ajuste IA_MODELO no .env.", temporario=False)
            erro.indisponivel = True    # outro modelo pode funcionar
            return erro
        if codigo == 400:
            return ErroProvedor("O Gemini recusou a requisição. Tente reformular a pergunta.", temporario=False)
        if codigo == 429 or "quota" in texto or "resource_exhausted" in texto:
            return ErroProvedor("O limite gratuito do Gemini foi atingido. Tente novamente em alguns instantes.", temporario=True)
        if codigo in (500, 502, 503, 504) or "timeout" in texto or "timed out" in texto or "connect" in texto:
            return ErroProvedor("O serviço do Gemini está indisponível ou demorou demais. Tente novamente.", temporario=True)
        return ErroProvedor("Não foi possível falar com o Gemini agora.", temporario=True)
