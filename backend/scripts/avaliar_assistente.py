"""Avalia o assistente de IA: 20 perguntas básicas (item 15c) + 11 avançadas (item 15c.3). Roda na pasta backend, com o venv ativo:

    python scripts/avaliar_assistente.py --referencias   # resposta CERTA de cada pergunta no seu banco + diagnóstico dos seus dados (não usa o Gemini)
    python scripts/avaliar_assistente.py --defesas       # 60+ ataques às camadas de segurança, sem Gemini: todos precisam ser BLOQUEADOS
    python scripts/avaliar_assistente.py                 # avaliação completa do conjunto básico (gasta cota do Gemini: 20 perguntas)
    python scripts/avaliar_assistente.py --conjunto avancado   # só as 11 perguntas avançadas (21 a 31); use 'todos' para as 31
    python scripts/avaliar_assistente.py --so 1,5,16     # só alguns casos
    python scripts/avaliar_assistente.py --categoria recusa
    python scripts/avaliar_assistente.py --modelo gemini-3.5-flash-lite --sem-reserva   # fixa UM modelo (resultado atribuível a ele)
    python scripts/avaliar_assistente.py --intervalo 15  # segundos entre perguntas (padrão 10; aumente se der erro de cota)

Nada é gravado no banco: só lê. Os resultados vão para a pasta avaliacao_resultados/ (CSV para Excel e JSON completo).
Use IA_MODO_PRIVADO desligado: no modo privado o modelo não recebe valores e a avaliação de números perde o sentido."""
import csv
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from core.assistente import avaliacao, config, defesas  # noqa: E402
from core.assistente.avaliacao import CATEGORIAS, CONJUNTOS  # noqa: E402

PASTA = "avaliacao_resultados"


def argumento(nome, padrao=None):
    if nome in sys.argv:
        i = sys.argv.index(nome)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return padrao


def selecionar():
    conjunto = argumento("--conjunto", "basico")
    if conjunto not in CONJUNTOS:
        print(f"Conjunto inválido. Use um de: {', '.join(CONJUNTOS)}")
        sys.exit(1)
    casos = list(CONJUNTOS[conjunto])
    so = argumento("--so")
    if so:
        numeros = {int(n) for n in so.split(",") if n.strip().isdigit()}
        casos = [c for c in casos if c.numero in numeros]
    cat = argumento("--categoria")
    if cat:
        if cat not in CATEGORIAS:
            print(f"Categoria inválida. Use uma de: {', '.join(CATEGORIAS)}")
            sys.exit(1)
        casos = [c for c in casos if c.categoria == cat]
    if not casos:
        print("Nenhum caso selecionado.")
        sys.exit(1)
    return casos


def mostrar_diagnostico():
    diag = avaliacao.diagnosticar()
    print("\nDIAGNÓSTICO DA MASSA DE DADOS: as 'armadilhas' que a avaliação precisa que existam no banco")
    for d in diag:
        marca = "OK    " if d["coberta"] else "FALTA "
        print(f"  [{marca}] {d['o_que_testa']}  (casos {d['casos']}; achei {d['encontrados']}, preciso de {d['minimo']})")
        if d["erro"]:
            print(f"           erro ao consultar: {d['erro']}")
        elif not d["coberta"]:
            print(f"           como criar: {d['dica']}")
    faltam = [d for d in diag if not d["coberta"]]
    print(f"\nCobertura: {len(diag) - len(faltam)} de {len(diag)} armadilhas. " +
          ("Os dados cobrem tudo." if not faltam else "Onde falta, um acerto prova menos (pode ser coincidência). Cadastre os dados que faltam e rode --referencias de novo."))
    return diag


def mostrar_referencias(casos):
    print(f"Respostas certas segundo o seu banco ({len(casos)} casos). INCONCLUSIVO = a pergunta não consegue ser avaliada com estes dados.\n")
    for c in casos:
        if not c.referencia:
            print(f"[{c.numero:2}] {c.categoria:12} {c.pergunta}\n      (sem consulta de referência: avaliado pelo texto da resposta)")
            continue
        try:
            linhas = avaliacao.rodar_referencia(c.referencia)
        except Exception as e:
            print(f"[{c.numero:2}] {c.categoria:12} {c.pergunta}\n      ERRO na referência: {type(e).__name__}: {str(e)[:150]}")
            continue
        valores = avaliacao._valores_de_referencia(linhas)
        vazio = not linhas or (not any(isinstance(v, str) for v in valores) and all(v == 0.0 for v in valores))
        print(f"[{c.numero:2}] {c.categoria:12} {c.pergunta}\n      referência: {linhas}" + ("   -> INCONCLUSIVO (sem dados)" if vazio else ""))
    mostrar_diagnostico()
    return 0


def rodar_defesas():
    print("Tentando atacar cada camada de defesa (nada é alterado no banco). Esperado: tudo BLOQUEADO; usos legítimos PERMITIDOS.\n")
    r = defesas.executar_defesas()
    camada = None
    for v in r["verificacoes"]:
        if v["camada"] != camada:
            camada = v["camada"]
            print(f"--- camada {camada}")
        print(f"  [{v['resultado']:7}] {v['tentativa']}" + (f"  -> {v['detalhe']}" if v["resultado"] != "OK" or v["camada"] in ("1-banco", "5-limites") else ""))
    s = r["resumo"]
    print("\n" + "=" * 70 + f"\nRESUMO DAS DEFESAS: {s['OK']} OK, {s['FALHA']} falhas, {s['INCERTO']} incertos (de {s['total']})")
    for cam, c in s["por_camada"].items():
        print(f"  camada {cam:12} {c['OK']} OK, {c['FALHA']} falhas, {c['INCERTO']} incertos")
    os.makedirs(PASTA, exist_ok=True)
    caminho = os.path.join(PASTA, f"defesas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump({"gerado_em": datetime.now().isoformat(timespec="seconds"), **r}, f, ensure_ascii=False, indent=2)
    print(f"Arquivo: {caminho}")
    return 0 if s["FALHA"] == 0 else 1


def linha_caso(r, total):
    sinal = {"OK": "OK         ", "FALHA": "FALHA      ", "INCONCLUSIVO": "INCONCLUSIV", "ERRO_PROVEDOR": "ERRO GEMINI"}[r["resultado"]]
    print(f"[{r['numero']:2}/{total}] {sinal} {r['categoria']:12} {r['pergunta'][:60]}")
    if r["resultado"] != "OK":
        print(f"        {r['motivo']}")
    print(f"        {r['passos']} passo(s), {r['tokens_entrada']}/{r['tokens_saida']} tokens, {r['duracao_ms']} ms" +
          (f", modelo: {', '.join(r['modelos'])}" if r["modelos"] else ""))
    for g in r.get("registros", []):
        if g["status"] in avaliacao.STATUS_BARRADOS:
            print(f"        barrado ({g['status']}): {' '.join((g['entrada'] or '').split())[:160]}" + (f"  -> {g['erro']}" if g["erro"] else ""))
    sys.stdout.flush()


def salvar(resultado, modelo, massa=None):
    os.makedirs(PASTA, exist_ok=True)
    carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
    caminho_json = os.path.join(PASTA, f"avaliacao_{carimbo}.json")
    caminho_csv = os.path.join(PASTA, f"avaliacao_{carimbo}.csv")
    with open(caminho_json, "w", encoding="utf-8") as f:
        json.dump({"gerado_em": datetime.now().isoformat(timespec="seconds"), "modelo_configurado": modelo,
                   "reservas_configuradas": config.modelos_reserva(), "modo_privado": config.modo_privado(),
                   "massa_de_dados": massa, **resultado}, f, ensure_ascii=False, indent=2)
    campos = ["numero", "categoria", "pergunta", "resultado", "motivo", "passos", "tokens_entrada", "tokens_saida", "duracao_ms",
              "consultas_ok", "sql_recusado", "sem_permissao", "erro_execucao", "autocorrecao", "usou_relatorio", "modelos", "trocas_de_modelo", "sql", "sql_barrado", "resposta"]
    with open(caminho_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for r in resultado["casos"]:
            barrado = " || ".join(" ".join((g["entrada"] or "").split()) for g in r.get("registros", []) if g["status"] in avaliacao.STATUS_BARRADOS)
            w.writerow({**r, "modelos": ", ".join(r["modelos"]), "trocas_de_modelo": " | ".join(r["trocas_de_modelo"]), "sql": " || ".join(r["sql"]), "sql_barrado": barrado})
    return caminho_csv, caminho_json


def imprimir_resumo(resumo):
    g = resumo["geral"]
    print("\n" + "=" * 70 + "\nRESUMO")
    print(f"Geral: {g['OK']} OK, {g['FALHA']} falhas, {g['INCONCLUSIVO']} inconclusivos, {g['ERRO_PROVEDOR']} erros do Gemini (de {g['total']})")
    if g["acerto"] is not None:
        print(f"Taxa de acerto (OK / OK+FALHA): {g['acerto'] * 100:.1f}%")
    if len(resumo.get("por_conjunto", {})) > 1:
        for nome, c in resumo["por_conjunto"].items():
            taxa = f"{c['acerto'] * 100:.0f}%" if c["acerto"] is not None else "-"
            print(f"  conjunto {nome:9} {c['OK']}/{c['total']} OK  (falhas {c['FALHA']}, inconclusivos {c['INCONCLUSIVO']}, erros {c['ERRO_PROVEDOR']})  acerto {taxa}")
    for cat, c in resumo["por_categoria"].items():
        taxa = f"{c['acerto'] * 100:.0f}%" if c["acerto"] is not None else "-"
        print(f"  {cat:13} {c['OK']}/{c['total']} OK  (falhas {c['FALHA']}, inconclusivos {c['INCONCLUSIVO']}, erros {c['ERRO_PROVEDOR']})  acerto {taxa}")
    print(f"Validador recusou SQL: {resumo['validador_bloqueou_sql']} vez(es) | escopo negou por permissão: {resumo['escopo_negou_por_permissao']} | erros de execução: {resumo['erros_de_execucao']}")
    if resumo.get("consultas_barradas"):
        print("Consultas barradas (caso: motivo):")
        for b in resumo["consultas_barradas"]:
            print(f"  caso {b['caso']}: {b['status']} -> {b['erro'] or ''} | {' '.join((b['entrada'] or '').split())[:110]}")
    print(f"Perguntas em que o modelo errou, leu a mensagem e se corrigiu: {resumo['perguntas_com_autocorrecao']}")
    print(f"Respostas em que o modelo principal falhou e uma reserva assumiu: {resumo['casos_com_troca_de_modelo']} {resumo['motivos_das_trocas'] or ''}")
    print(f"Médias: {resumo['passos_medios']} passos, {resumo['tokens_entrada_medios']}/{resumo['tokens_saida_medios']} tokens, "
          f"{resumo['duracao_media_ms']} ms (mediana {resumo['duracao_mediana_ms']} ms)")
    print(f"Modelos que responderam: {resumo['modelos_que_responderam']}")
    print("Integridade do banco (contagem das 15 views antes = depois): " + ("OK" if resumo["integridade_ok"] else f"DIFERENTE! {resumo['integridade_detalhe']}"))


def main() -> int:
    casos = selecionar()
    if "--lista" in sys.argv:
        for c in casos:
            print(f"[{c.numero:2}] {c.categoria:12} {c.pergunta}")
        return 0
    if not config.banco_ia_configurado():
        print("FALHOU: IA_DB_USER/IA_DB_PASSWORD não estão no .env (item 15a).")
        return 1
    if "--defesas" in sys.argv:
        return rodar_defesas()
    if "--referencias" in sys.argv:
        return mostrar_referencias(casos)
    if not config.api_key():
        print("FALHOU: GEMINI_API_KEY não está no .env.")
        return 1
    if config.modo_privado():
        print("AVISO: IA_MODO_PRIVADO está ligado; as perguntas com números vão falhar por falta de valores. Desligue para avaliar.\n")
    if argumento("--modelo"):
        os.environ["IA_MODELO"] = argumento("--modelo")
    if "--sem-reserva" in sys.argv:
        os.environ["IA_MODELO_RESERVA"] = ""   # vazio desliga a reserva: todas as respostas vêm do mesmo modelo
    from core.assistente.provedor_gemini import ProvedorGemini
    from database import SessionLocal
    intervalo = float(argumento("--intervalo", "10"))
    print(f"Modelo: {config.modelo()} | reservas: {', '.join(config.modelos_reserva()) or 'nenhuma'} | {len(casos)} perguntas | intervalo {intervalo}s\n")
    db = SessionLocal()
    inicio = time.monotonic()
    massa = avaliacao.diagnosticar()
    faltam = [d["o_que_testa"] for d in massa if not d["coberta"]]
    if faltam:
        print(f"AVISO: {len(faltam)} de {len(massa)} armadilhas não existem nos seus dados (veja: --referencias). Alguns acertos provam menos.\n")
    try:
        resultado = avaliacao.avaliar(db, ProvedorGemini(), casos, intervalo=intervalo, ao_terminar_caso=lambda r: linha_caso(r, len(casos)))
    finally:
        db.close()
    imprimir_resumo(resultado["resumo"])
    csv_, json_ = salvar(resultado, config.modelo(), massa)
    print(f"\nTempo total: {int(time.monotonic() - inicio)} s\nArquivos: {csv_}\n          {json_}")
    print("Dica: adicione 'avaliacao_resultados/' ao .gitignore se não quiser versionar as respostas (elas trazem dados do seu banco).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
