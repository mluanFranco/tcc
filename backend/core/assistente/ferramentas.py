"""Ferramentas que a IA pode acionar. Quem decide e executa somos nós; o modelo só pede.
- consultar_banco: SQL livre (somente SELECT nas views, validado, com escopo por permissão);
- relatorio_financeiro: os relatórios do item 12 (regras de competência/caixa já prontas, melhor que SQL à mão);
- como_usar: regras de negócio do sistema (base de conhecimento).
Toda chamada vira uma linha de auditoria."""
import json
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from core import relatorios, relatorios_financeiro, relatorios_rankings
from core.assistente import config, conhecimento, consulta
from core.assistente.provedor import Ferramenta
from core.permissoes import tem_permissao

SQL, RELATORIO, AJUDA = "consultar_banco", "relatorio_financeiro", "como_usar"
MAX_CARACTERES_PARA_O_MODELO = 30000

TIPOS_RELATORIO = ["resumo", "serie", "comparativo", "fluxo_caixa", "fluxo_previsto", "vencidos", "vendas_por_produto",
                   "vendas_por_cliente", "compras_por_fornecedor", "compras_por_produto", "por_forma_pagamento"]


@dataclass
class Contexto:
    db: Session
    efetivas: Set[str]
    engine: Optional[Engine] = None
    privado: bool = False


@dataclass
class ResultadoFerramenta:
    para_modelo: Dict[str, Any]
    status: str = "ok"                 # ok | sql_recusado | sem_permissao | erro_execucao | erro_ferramenta
    entrada: str = ""
    views: str = ""
    linhas: Optional[int] = None
    erro: Optional[str] = None
    tabela: Optional[Dict[str, Any]] = None   # mostrada ao usuário (a mesma consulta que a IA fez)
    sql: Optional[str] = None
    duracao_ms: int = 0


def ferramentas_disponiveis(efetivas: Set[str]) -> List[Ferramenta]:
    lista = [
        Ferramenta(SQL, (
            "Executa UMA consulta SQL de leitura (MySQL) sobre as views do esquema informado e devolve as linhas. "
            "Use para perguntas pontuais sobre os dados. Só SELECT; só as views listadas; sempre filtre e agregue (GROUP BY) em vez de listar tudo."),
            {"type": "object", "properties": {"sql": {"type": "string", "description": "Um único SELECT em MySQL, sem comentários e sem ponto e vírgula."}}, "required": ["sql"]}),
        Ferramenta(AJUDA, "Explica regras de negócio e funcionamento do sistema (vendas, compras, cotações, produção, financeiro, estoque, acesso...). Use para perguntas 'como funciona' ou 'o que significa'.",
                   {"type": "object", "properties": {"assunto": {"type": "string", "description": "Assunto ou palavras-chave, ex.: 'estorno de baixa'."}}, "required": ["assunto"]}),
    ]
    if tem_permissao(efetivas, "relatorios.ver"):
        lista.insert(1, Ferramenta(RELATORIO, (
            "Relatórios financeiros prontos e já corretos quanto a regras contábeis (receita só de vendas confirmadas, CMV, margem, caixa x competência). "
            "PREFIRA esta ferramenta a SQL para: resultado/lucro/margem do período, fluxo de caixa, previsão, inadimplência (vencidos), séries por mês/estação, "
            "comparativos entre períodos e rankings. Datas no formato AAAA-MM-DD; sem datas = do início do ano até hoje."), {
            "type": "object",
            "properties": {
                "tipo": {"type": "string", "enum": TIPOS_RELATORIO, "description": "Qual relatório."},
                "data_inicio": {"type": "string", "description": "AAAA-MM-DD. Em 'comparativo' é o início do período A."},
                "data_fim": {"type": "string", "description": "AAAA-MM-DD. Em 'comparativo' é o fim do período A; em 'fluxo_previsto', o último dia da previsão."},
                "inicio_b": {"type": "string", "description": "Só em 'comparativo': início do período B."},
                "fim_b": {"type": "string", "description": "Só em 'comparativo': fim do período B."},
                "agrupamento": {"type": "string", "enum": ["mes", "trimestre", "estacao", "ano"], "description": "Em 'serie', 'fluxo_caixa' e 'fluxo_previsto'."},
                "limite": {"type": "integer", "description": "Rankings: quantos itens (1 a 100). Padrão 10."},
                "ordenar_por": {"type": "string", "enum": ["total", "quantidade", "receita", "margem"], "description": "Rankings de produto. vendas: receita|quantidade|margem; compras: total|quantidade."},
                "origem": {"type": "string", "enum": ["venda", "compra"], "description": "Só em 'por_forma_pagamento'."},
                "tipo_titulo": {"type": "string", "enum": ["pagar", "receber"], "description": "Só em 'vencidos': limita a um lado."},
            },
            "required": ["tipo"]}))
    return lista


# ------------------------------------------------------------------ utilidades
def _cabe(dado: Any) -> bool:
    return len(json.dumps(dado, ensure_ascii=False, default=str)) <= MAX_CARACTERES_PARA_O_MODELO


def _data(valor: Any, nome: str) -> Optional[date]:
    if valor in (None, ""):
        return None
    try:
        return date.fromisoformat(str(valor))
    except ValueError:
        raise ValueError(f"'{nome}' deve estar no formato AAAA-MM-DD.")


def _para_o_modelo_sql(res, privado: bool) -> Dict[str, Any]:
    if privado:
        return {"colunas": res.colunas, "total_linhas": len(res.linhas), "truncado": res.truncado,
                "aviso": "Modo privado: os valores NÃO foram enviados a você. O usuário vê a tabela completa na tela. "
                         "Responda em termos gerais (o que foi consultado e quantas linhas), sem inventar valores."}
    linhas = res.linhas
    saida = {"colunas": res.colunas, "linhas": linhas, "truncado": res.truncado, "total_linhas": len(linhas)}
    while linhas and not _cabe(saida):
        linhas = linhas[: max(1, len(linhas) // 2)] if len(linhas) > 1 else []
        saida = {"colunas": res.colunas, "linhas": linhas, "truncado": True, "total_linhas": len(res.linhas),
                 "aviso": f"Só as primeiras {len(linhas)} linhas foram enviadas a você por tamanho; refine com filtros ou agregação."}
    return saida


# ------------------------------------------------------------------ execução
def _executar_sql(args: Dict[str, Any], ctx: Contexto) -> ResultadoFerramenta:
    sql = str(args.get("sql") or "")
    r = ResultadoFerramenta(para_modelo={}, entrada=sql)
    try:
        res, v = consulta.consultar(sql, ctx.efetivas, engine=ctx.engine)
    except consulta.ErroSql as e:
        r.status, r.erro, r.para_modelo = "sql_recusado", str(e), {"erro": str(e)}
    except consulta.ErroEscopo as e:
        r.status, r.erro = "sem_permissao", str(e)
        r.para_modelo = {"erro": str(e), "instrucao": "Diga ao usuário que ele não tem permissão para esses dados. Não tente contornar."}
    except consulta.ErroConsulta as e:
        r.status, r.erro, r.para_modelo = "erro_execucao", str(e), {"erro": str(e)}
    except RuntimeError as e:   # banco da IA não configurado no .env
        r.status, r.erro, r.para_modelo = "erro_execucao", "banco do assistente não configurado", {"erro": "O banco de consultas do assistente não está configurado."}
    else:
        r.views, r.linhas, r.sql = ",".join(sorted(v.views)), len(res.linhas), v.sql
        r.tabela = {"colunas": res.colunas, "linhas": res.linhas, "truncado": res.truncado}
        r.para_modelo = _para_o_modelo_sql(res, ctx.privado)
    return r


def _executar_relatorio(args: Dict[str, Any], ctx: Contexto) -> ResultadoFerramenta:
    r = ResultadoFerramenta(para_modelo={}, entrada=json.dumps(args, ensure_ascii=False, default=str)[:2000])
    if not tem_permissao(ctx.efetivas, "relatorios.ver"):
        r.status, r.erro = "sem_permissao", "Você não tem permissão para os relatórios (necessária: relatorios.ver)."
        r.para_modelo = {"erro": r.erro}
        return r
    tipo = args.get("tipo")
    try:
        if tipo not in TIPOS_RELATORIO:
            raise ValueError(f"'tipo' deve ser um de: {', '.join(TIPOS_RELATORIO)}.")
        di, df = _data(args.get("data_inicio"), "data_inicio"), _data(args.get("data_fim"), "data_fim")
        agrup = args.get("agrupamento") or "mes"
        if agrup not in ("mes", "trimestre", "estacao", "ano"):
            raise ValueError("'agrupamento' deve ser mes, trimestre, estacao ou ano.")
        try:
            limite = int(args.get("limite") or 10)
        except (TypeError, ValueError):
            raise ValueError("'limite' deve ser um número inteiro.")
        if not 1 <= limite <= 100:
            raise ValueError("'limite' deve estar entre 1 e 100.")
        db = ctx.db
        if tipo == "fluxo_previsto":
            ini, fim = relatorios_financeiro.resolver_periodo_previsto(df)
            dado = relatorios_financeiro.fluxo_previsto(db, ini, fim, agrup)
        elif tipo == "vencidos":
            lado = args.get("tipo_titulo")
            if lado not in (None, "", "pagar", "receber"):
                raise ValueError("'tipo_titulo' deve ser pagar ou receber.")
            dado = relatorios_financeiro.vencidos(db, df or date.today(), lado or None)
        elif tipo == "comparativo":
            ib, fb = _data(args.get("inicio_b"), "inicio_b"), _data(args.get("fim_b"), "fim_b")
            if not (di and df and ib and fb):
                raise ValueError("Para 'comparativo' informe data_inicio, data_fim (período A) e inicio_b, fim_b (período B).")
            dado = relatorios.comparativo(db, relatorios.resolver_periodo(di, df), relatorios.resolver_periodo(ib, fb))
        else:
            ini, fim = relatorios.resolver_periodo(di, df)
            if tipo == "resumo":
                dado = relatorios.resumo(db, ini, fim)
            elif tipo == "serie":
                dado = relatorios.serie(db, ini, fim, agrup)
            elif tipo == "fluxo_caixa":
                dado = relatorios_financeiro.fluxo_caixa(db, ini, fim, agrup)
            elif tipo == "vendas_por_cliente":
                dado = relatorios_rankings.vendas_por_cliente(db, ini, fim, limite)
            elif tipo == "compras_por_fornecedor":
                dado = relatorios_rankings.compras_por_fornecedor(db, ini, fim, limite)
            elif tipo == "vendas_por_produto":
                ordem = args.get("ordenar_por") or "receita"
                if ordem not in ("receita", "quantidade", "margem"):
                    raise ValueError("Em vendas_por_produto, 'ordenar_por' deve ser receita, quantidade ou margem.")
                dado = relatorios_rankings.vendas_por_produto(db, ini, fim, limite, ordem)
            elif tipo == "compras_por_produto":
                ordem = args.get("ordenar_por") or "total"
                if ordem not in ("total", "quantidade"):
                    raise ValueError("Em compras_por_produto, 'ordenar_por' deve ser total ou quantidade.")
                dado = relatorios_rankings.compras_por_produto(db, ini, fim, limite, ordem)
            else:  # por_forma_pagamento
                origem = args.get("origem") or "venda"
                if origem not in ("venda", "compra"):
                    raise ValueError("'origem' deve ser venda ou compra.")
                dado = relatorios_rankings.por_forma_pagamento(db, ini, fim, origem)
        dado = jsonable_encoder(dado)
        if not _cabe(dado):
            raise ValueError("O resultado ficou grande demais. Use um período menor, um agrupamento maior ou um limite menor.")
        r.para_modelo = {"relatorio": tipo, "dados": dado}
        r.linhas = None
    except HTTPException as e:
        r.status, r.erro, r.para_modelo = "erro_ferramenta", str(e.detail)[:255], {"erro": str(e.detail)}
    except ValueError as e:
        r.status, r.erro, r.para_modelo = "erro_ferramenta", str(e)[:255], {"erro": str(e)}
    return r


def _executar_ajuda(args: Dict[str, Any], ctx: Contexto) -> ResultadoFerramenta:
    assunto = str(args.get("assunto") or "")[:200]
    return ResultadoFerramenta(para_modelo={"conhecimento": conhecimento.buscar(assunto)}, entrada=assunto)


_EXECUTORES = {SQL: _executar_sql, RELATORIO: _executar_relatorio, AJUDA: _executar_ajuda}


def executar(nome: str, args: Dict[str, Any], ctx: Contexto, oferecidas: Set[str]) -> ResultadoFerramenta:
    inicio = time.monotonic()
    if nome not in oferecidas or nome not in _EXECUTORES:
        r = ResultadoFerramenta(para_modelo={"erro": f"Ferramenta '{nome}' indisponível."}, status="erro_ferramenta", erro="ferramenta indisponível", entrada=str(args)[:500])
    else:
        try:
            r = _EXECUTORES[nome](dict(args or {}), ctx)
        except Exception as e:   # falha inesperada: nunca vaza detalhes internos para o modelo/usuário
            try:
                ctx.db.rollback()
            except Exception:
                pass
            r = ResultadoFerramenta(para_modelo={"erro": "Falha interna ao executar a ferramenta."}, status="erro_ferramenta",
                                    erro=f"{type(e).__name__}"[:255], entrada=str(args)[:500])
    r.duracao_ms = int((time.monotonic() - inicio) * 1000)
    return r
