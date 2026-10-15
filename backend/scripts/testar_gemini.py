"""Teste manual do Gemini. Rode na pasta backend, com o venv ativo:

    python scripts/testar_gemini.py              # confere a chave, uma resposta simples e uma chamada de ferramenta
    python scripts/testar_gemini.py --completo   # ponta a ponta: pergunta real sobre o seu banco (como administrador)
    python scripts/testar_gemini.py --modelos    # descobre quais modelos a sua chave consegue usar (use se der erro 404)

Nada é gravado: só lê. Mostra o consumo de tokens de cada passo."""
import os
import sys

sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from core.assistente import config  # noqa: E402
from core.assistente.provedor import ChamadaFerramenta, ErroProvedor, Ferramenta, TurnoChamadas, TurnoResultados, TurnoTexto  # noqa: E402


def passo(msg):
    print(f"\n== {msg}")


PREFERIDOS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
_FORA = ("tts", "image", "live", "embedding", "transcribe", "robotics", "omni", "computer", "audio", "preview")


def descobrir_modelos() -> int:
    from core.assistente.provedor_gemini import ProvedorGemini
    g = ProvedorGemini()
    disponiveis = []
    try:
        for m in g._cliente.models.list():
            nome = (m.name or "").replace("models/", "")
            if "generateContent" in (getattr(m, "supported_actions", None) or []) and nome.startswith("gemini") and not any(x in nome for x in _FORA):
                disponiveis.append(nome)
        print("Modelos de texto que a sua chave enxerga:", ", ".join(sorted(disponiveis)) or "(nenhum listado)")
    except Exception as e:
        print(f"Não consegui listar os modelos ({type(e).__name__}); vou testar os conhecidos.")
    candidatos = [m for m in PREFERIDOS if not disponiveis or m in disponiveis] + [m for m in sorted(disponiveis) if m not in PREFERIDOS][:3]
    funcionou = None
    for nome in candidatos:
        try:
            r = ProvedorGemini(modelo=nome).gerar("Responda apenas: ok", [TurnoTexto("usuario", "ok?")], [])
            print(f"  FUNCIONA  {nome}  (tokens {r.uso.entrada}/{r.uso.saida})")
            funcionou = funcionou or nome
        except ErroProvedor as e:
            print(f"  falhou    {nome}: {e.mensagem} [{e.detalhe}]")
    if funcionou:
        print(f"\nColoque no .env:  IA_MODELO={funcionou}")
        return 0
    print("\nNenhum modelo respondeu. Confira a chave, a cota do plano gratuito e o acesso à internet.")
    return 1


def main() -> int:
    if "--modelos" in sys.argv:
        if not config.api_key():
            print("FALHOU: GEMINI_API_KEY não está no .env.")
            return 1
        return descobrir_modelos()
    passo("1/3 Configuração")
    if not config.api_key():
        print("FALHOU: GEMINI_API_KEY não está no .env (crie a chave em https://aistudio.google.com/apikey).")
        return 1
    print(f"chave encontrada ({config.api_key()[:4]}...), modelo: {config.modelo()}, reservas: {', '.join(config.modelos_reserva()) or 'nenhuma'}")
    try:
        from core.assistente.provedor_gemini import ProvedorGemini
        g = ProvedorGemini()
    except ImportError:
        print("FALHOU: biblioteca ausente. Rode: pip install google-genai")
        return 1
    try:
        passo("2/3 Resposta simples")
        r = g.gerar("Responda em uma frase curta, em português.", [TurnoTexto("usuario", "Diga olá para a Nova Sorvetes.")], [])
        print("resposta:", r.texto, f"| tokens: {r.uso.entrada} entrada / {r.uso.saida} saída | modelo: {r.modelo}")

        passo("3/3 Chamada de ferramenta")
        fer = [Ferramenta("consultar_banco", "Executa um SELECT e devolve as linhas.",
                          {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]})]
        turnos = [TurnoTexto("usuario", "Quantos produtos existem na view v_produtos? Use a ferramenta consultar_banco.")]
        r = g.gerar("Você consulta o banco só com a ferramenta. View: v_produtos(id, nome).", turnos, fer)
        if not r.chamadas:
            print("AVISO: o modelo respondeu sem chamar a ferramenta:", r.texto)
            return 1
        c = r.chamadas[0]
        print("o modelo pediu:", c.nome, c.args)
        turnos += [TurnoChamadas(r), TurnoResultados([(c, {"colunas": ["n"], "linhas": [[42]]})])]
        r2 = g.gerar("Você consulta o banco só com a ferramenta.", turnos, fer)
        print("resposta final:", r2.texto, f"| tokens: {r2.uso.entrada} / {r2.uso.saida} | modelo: {r2.modelo}")
    except ErroProvedor as e:
        print("FALHOU:", e.mensagem, f"[{e.detalhe}]" if e.detalhe else "")
        if "--modelos" not in sys.argv and "404" in (e.detalhe or ""):
            print("Dica: rode  python scripts/testar_gemini.py --modelos  para descobrir um modelo liberado para a sua chave.")
        return 1
    print("\nTudo certo: chave, modelo e chamada de ferramenta funcionam.")

    if "--completo" in sys.argv:
        passo("Ponta a ponta (administrador, dados reais)")
        from core.assistente import orquestrador
        from core.permissoes import CODIGOS
        from database import SessionLocal
        if not config.banco_ia_configurado():
            print("FALHOU: IA_DB_USER/IA_DB_PASSWORD não estão no .env (item 15a).")
            return 1
        db = SessionLocal()
        try:
            pergunta = "Quantos produtos ativos temos e quantos estão abaixo do estoque mínimo?"
            print("pergunta:", pergunta)
            s = orquestrador.responder(db, set(CODIGOS), pergunta, [], g)
            print("SQL executado:", *s.consultas, sep="\n  ")
            print("resposta:", s.texto)
            print(f"passos: {s.passos} | tokens: {s.uso.entrada}/{s.uso.saida} | {s.duracao_ms} ms")
        except ErroProvedor as e:
            print("FALHOU:", e.mensagem, f"[{e.detalhe}]" if e.detalhe else "")
            return 1
        finally:
            db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
