#!/usr/bin/env python3
"""Gera o DER (SVG + PNG) a partir do backend/models.py, sem importar SQLAlchemy.

Uso (a partir de qualquer pasta):
    python backend/scripts/gerar_der.py [models.py] [saida_sem_extensao]

Sem argumentos, le backend/models.py e grava
frontend/assets/images/der_nova_sorvetes.svg e .png.
O PNG exige o pacote `playwright` (pip install playwright && playwright install chromium);
sem ele, apenas o SVG e gerado. Se criar tabelas novas, inclua-as em MODULO e LAYOUT.
"""
import ast
import heapq
import os
import re
import sys
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "models.py")
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    AQUI, "..", "..", "frontend", "assets", "images", "der_nova_sorvetes")

# ---------------------------------------------------------------- leitura
def tipo_sql(node, aliases):
    s = ast.unparse(node)
    s = aliases.get(s, s)
    s = s.replace("Integer", "INT").replace("Boolean", "BOOLEAN")
    s = s.replace("DateTime", "DATETIME").replace("Date", "DATE")
    s = s.replace("Float", "FLOAT").replace("Text", "TEXT")
    s = s.replace("String(", "VARCHAR(").replace("Numeric(", "DECIMAL(")
    s = s.replace(", ", ",")
    return s


def ler_modelos(caminho):
    tree = ast.parse(open(caminho, encoding="utf-8").read())
    aliases = {}
    for n in tree.body:
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call):
            aliases[n.targets[0].id] = ast.unparse(n.value)
    tabelas = {}
    for cls in [n for n in tree.body if isinstance(n, ast.ClassDef)]:
        nome = None
        cols = []
        for st in cls.body:
            if not isinstance(st, ast.Assign):
                continue
            alvo = st.targets[0].id
            if alvo == "__tablename__":
                nome = st.value.value
            elif isinstance(st.value, ast.Call) and getattr(st.value.func, "id", "") == "Column":
                call = st.value
                kw = {k.arg: k.value for k in call.keywords}
                pk = "primary_key" in kw and kw["primary_key"].value is True
                fk = None
                for a in call.args[1:]:
                    if isinstance(a, ast.Call) and getattr(a.func, "id", "") == "ForeignKey":
                        fk = a.args[0].value.split(".")
                notnull = ("nullable" in kw and kw["nullable"].value is False) or pk
                uq = "unique" in kw and kw["unique"].value is True
                cols.append(dict(nome=alvo, tipo=tipo_sql(call.args[0], aliases), pk=pk, fk=fk,
                                 opcional=(fk is not None and not notnull), uq=uq))
        if nome:
            tabelas[nome] = cols
    return tabelas


TABELAS = ler_modelos(MODELS)
assert len(TABELAS) == 32, len(TABELAS)

# --------------------------------------------------------------- aparência
MODULO = {
    "Controle de acesso": ("#2563eb", ["usuario", "grupo_acesso", "permissao", "grupo_permissao", "usuario_permissao"]),
    "Cadastros": ("#16a34a", ["categoria", "subcategoria", "unidade_medida", "produto", "cliente", "cliente_endereco",
                              "fornecedor", "forma_pagamento", "forma_pagamento_parcela"]),
    "Pedidos e cotações": ("#ea580c", ["pedido_venda", "item_pedido_venda", "pedido_compra", "item_pedido_compra",
                                       "cotacao", "item_cotacao"]),
    "Geladeiras": ("#0891b2", ["geladeira", "historico_manutencao"]),
    "Produção": ("#7c3aed", ["receita", "receita_item", "ordem_producao", "ordem_producao_item"]),
    "Financeiro": ("#ca8a04", ["categoria_financeira", "titulo_financeiro", "baixa_titulo"]),
    "Assistente de IA": ("#db2777", ["assistente_conversa", "assistente_mensagem", "assistente_log"]),
}
COR = {t: c for _, (c, ts) in MODULO.items() for t in ts}
assert set(COR) == set(TABELAS)

W = 300
HEAD = 30
ROW = 20
PX, PY = 70, 150          # origem do layout
PITCH_X = 400
FONT = "Inter, 'DejaVu Sans', Arial, sans-serif"

# (coluna, y) de cada tabela - y relativo a PY
LAYOUT = ({
 "grupo_permissao": (0, 0), "grupo_acesso": (1, 0), "usuario": (2, 0), "usuario_permissao": (3, 0), "permissao": (4, 0),
 "assistente_conversa": (5, 0), "assistente_mensagem": (6, 0), "assistente_log": (5, 200),
 "item_pedido_venda": (0, 330), "pedido_venda": (1, 330), "cotacao": (2, 330), "pedido_compra": (3, 330), "item_pedido_compra": (4, 330),
 "titulo_financeiro": (5, 560), "categoria_financeira": (6, 560), "baixa_titulo": (6, 820),
 "cliente_endereco": (0, 740), "cliente": (1, 740), "item_cotacao": (2, 740), "produto": (3, 740), "fornecedor": (4, 740),
 "geladeira": (0, 1120), "historico_manutencao": (1, 1020),
 "forma_pagamento": (2, 960), "forma_pagamento_parcela": (2, 1120),
 "categoria": (3, 1180), "subcategoria": (4, 1180), "unidade_medida": (3, 1360),
 "receita": (5, 1000), "receita_item": (6, 1100), "ordem_producao": (5, 1240), "ordem_producao_item": (6, 1260),
})



def altura(t):
    return HEAD + ROW * len(TABELAS[t]) + 8


BOX = {}
for t, (c, y) in LAYOUT.items():
    BOX[t] = dict(x=PX + c * PITCH_X, y=PY + y, w=W, h=altura(t))
assert set(BOX) == set(TABELAS), set(TABELAS) - set(BOX)

# sobreposição?
nomes = list(BOX)
for i, a in enumerate(nomes):
    for b in nomes[i + 1:]:
        A, B = BOX[a], BOX[b]
        if A["x"] < B["x"] + B["w"] + 20 and B["x"] < A["x"] + A["w"] + 20 and \
           A["y"] < B["y"] + B["h"] + 20 and B["y"] < A["y"] + A["h"] + 20:
            print("SOBREPOSTO:", a, b)

LARG = max(b["x"] + b["w"] for b in BOX.values()) + PX
ALT = max(b["y"] + b["h"] for b in BOX.values()) + 110

# ------------------------------------------------------------ relacionamentos
RELS = []
for t, cols in TABELAS.items():
    for i, c in enumerate(cols):
        if c["fk"]:
            RELS.append(dict(filho=t, col=c["nome"], pai=c["fk"][0], opc=c["opcional"], uq=c["uq"],
                             i_filho=i, i_pai=[x["nome"] for x in TABELAS[c["fk"][0]]].index(c["fk"][1])))
print("tabelas:", len(TABELAS), "relacionamentos:", len(RELS))

# ------------------------------------------------------------- roteamento
G = 10
NX, NY = LARG // G + 4, ALT // G + 4
bloq = [[False] * NY for _ in range(NX)]
for b in BOX.values():
    for gx in range(int(b["x"] // G) - 1, int((b["x"] + b["w"]) // G) + 2):
        for gy in range(int(b["y"] // G) - 1, int((b["y"] + b["h"]) // G) + 2):
            if 0 <= gx < NX and 0 <= gy < NY:
                bloq[gx][gy] = True
uso_h = defaultdict(int)
uso_v = defaultdict(int)


def porta(t, idx, lado):
    b = BOX[t]
    y = b["y"] + HEAD + ROW * idx + ROW / 2
    x = b["x"] - 0 if lado == "L" else b["x"] + b["w"]
    gx = int((x - G) // G) if lado == "L" else int((x + G) // G) + (1 if (x + G) % G else 0)
    gx = int(round((x - 2 * G) / G)) if lado == "L" else int(round((x + 2 * G) / G))
    gy = int(round(y / G))
    return x, y, gx, gy


def astar(ini, fim, dir_ini, dir_fim):
    # estado: (gx, gy, dir) dir: 0=h 1=v
    sx, sy = ini
    ex, ey = fim
    pq = [(0, 0, sx, sy, dir_ini, None)]
    visto = {}
    pai = {}
    cont = 0
    while pq:
        f, g, x, y, d, ant = heapq.heappop(pq)
        if (x, y, d) in visto:
            continue
        visto[(x, y, d)] = ant
        if (x, y) == (ex, ey) and d == dir_fim:
            # reconstrói
            caminho = []
            k = (x, y, d)
            while k:
                caminho.append((k[0], k[1]))
                k = visto[k]
            return caminho[::-1]
        for ndx, ndy, nd in ((1, 0, 0), (-1, 0, 0), (0, 1, 1), (0, -1, 1)):
            nx, ny = x + ndx, y + ndy
            if not (0 <= nx < NX and 0 <= ny < NY):
                continue
            if bloq[nx][ny] and (nx, ny) != (ex, ey) and (nx, ny) != (sx, sy):
                continue
            custo = 1
            if nd != d:
                custo += 6
            uso = uso_h if nd == 0 else uso_v
            custo += 7 * uso[(nx, ny)]
            outro = uso_v if nd == 0 else uso_h
            custo += 5 * outro[(nx, ny)]
            h = abs(nx - ex) + abs(ny - ey)
            heapq.heappush(pq, (g + custo + h, g + custo, nx, ny, nd, (x, y, d)))
    return None


ROTAS = []
ordem = sorted(RELS, key=lambda r: abs(BOX[r["filho"]]["x"] - BOX[r["pai"]]["x"]) +
               abs(BOX[r["filho"]]["y"] - BOX[r["pai"]]["y"]))
for r in ordem:
    melhor = None
    for lf in "LR":
        for lp in "LR":
            fx, fy, fgx, fgy = porta(r["filho"], r["i_filho"], lf)
            px, py, pgx, pgy = porta(r["pai"], r["i_pai"], lp)
            cam = astar((fgx, fgy), (pgx, pgy), 0, 0)
            if not cam:
                continue
            custo = len(cam) + 6 * sum(1 for i in range(1, len(cam) - 1)
                                       if (cam[i][0] - cam[i - 1][0], cam[i][1] - cam[i - 1][1]) !=
                                       (cam[i + 1][0] - cam[i][0], cam[i + 1][1] - cam[i][1]))
            if melhor is None or custo < melhor[0]:
                melhor = (custo, cam, lf, lp, (fx, fy), (px, py))
    custo, cam, lf, lp, pf, pp = melhor
    for i in range(1, len(cam)):
        (a, b), (c, d) = cam[i - 1], cam[i]
        (uso_h if b == d else uso_v)[(c, d)] += 1
    ROTAS.append(dict(rel=r, cam=cam, lf=lf, lp=lp, pf=pf, pp=pp))

# --------------------------------------------------------------- desenho
S = []
add = S.append
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARG}" height="{ALT}" viewBox="0 0 {LARG} {ALT}" font-family="{FONT}">')
add(f'<rect width="100%" height="100%" fill="#ffffff"/>')
add(f'<text x="{LARG/2}" y="52" text-anchor="middle" font-size="34" font-weight="700" fill="#0f172a">'
    f'DER — Sistema de Gestão de Estoque — Nova Sorvetes</text>')
add(f'<text x="{LARG/2}" y="84" text-anchor="middle" font-size="18" fill="#475569">'
    f'Banco sist_gest_est_mon (MySQL 8) · 32 tabelas · {len(RELS)} relacionamentos</text>')

# legenda
lx = PX
ly = 112
for nome, (cor, _) in MODULO.items():
    add(f'<rect x="{lx}" y="{ly-12}" width="16" height="16" rx="3" fill="{cor}"/>')
    add(f'<text x="{lx+24}" y="{ly+1}" font-size="15" fill="#334155">{nome}</text>')
    lx += 24 + len(nome) * 8.6 + 30


def caminho_svg(r):
    cam = r["cam"]
    pts = [r["pf"]] + [(gx * G, gy * G) for gx, gy in cam] + [r["pp"]]
    # ajusta primeiro/último trecho para ficar horizontal na borda
    fx, fy = r["pf"]
    px, py = r["pp"]
    mid = [(gx * G, gy * G) for gx, gy in cam]
    mid[0] = (mid[0][0], fy)
    mid[-1] = (mid[-1][0], py)
    pts = [(fx, fy)] + mid + [(px, py)]
    # remove pontos colineares
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = out[-1], pts[i], pts[i + 1]
        if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
            continue
        out.append(b)
    out.append(pts[-1])
    return out


# conectores
CONECT = []
for rt in ROTAS:
    pts = caminho_svg(rt)
    # garante ortogonalidade: se dois pontos consecutivos não alinham, insere cotovelo
    seg = [pts[0]]
    for p in pts[1:]:
        q = seg[-1]
        if q[0] != p[0] and q[1] != p[1]:
            seg.append((p[0], q[1]))
        seg.append(p)
    cor = COR[rt["rel"]["filho"]]
    d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in seg)
    add(f'<path d="{d}" fill="none" stroke="{cor}" stroke-width="1.5" stroke-linejoin="round" opacity="0.85"/>')
    CONECT.append((rt, seg))

# tabelas
for t, cols in TABELAS.items():
    b = BOX[t]
    cor = COR[t]
    add(f'<g>')
    add(f'<rect x="{b["x"]+2}" y="{b["y"]+3}" width="{b["w"]}" height="{b["h"]}" rx="7" fill="#0f172a" opacity="0.10"/>')
    add(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}" rx="7" fill="#ffffff" stroke="{cor}" stroke-width="1.8"/>')
    add(f'<path d="M {b["x"]} {b["y"]+HEAD} L {b["x"]} {b["y"]+7} Q {b["x"]} {b["y"]} {b["x"]+7} {b["y"]} '
        f'L {b["x"]+b["w"]-7} {b["y"]} Q {b["x"]+b["w"]} {b["y"]} {b["x"]+b["w"]} {b["y"]+7} '
        f'L {b["x"]+b["w"]} {b["y"]+HEAD} Z" fill="{cor}"/>')
    add(f'<text x="{b["x"]+b["w"]/2}" y="{b["y"]+20}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">{t}</text>')
    for i, c in enumerate(cols):
        y = b["y"] + HEAD + ROW * i
        if i % 2 == 1:
            add(f'<rect x="{b["x"]+1}" y="{y}" width="{b["w"]-2}" height="{ROW}" fill="#f8fafc"/>')
        ty = y + 14.5
        tag = "PK" if c["pk"] else ("FK" if c["fk"] else "")
        if c["pk"] and c["fk"]:
            tag = "PK,FK"
        if tag:
            add(f'<text x="{b["x"]+10}" y="{ty}" font-size="10.5" font-weight="700" fill="{cor}">{tag}</text>')
        peso = "700" if c["pk"] else "400"
        estilo = "italic" if (c["fk"] and not c["pk"]) else "normal"
        add(f'<text x="{b["x"]+50}" y="{ty}" font-size="13.5" font-weight="{peso}" font-style="{estilo}" fill="#0f172a">{c["nome"]}</text>')
        extra = " UQ" if c["uq"] else ""
        add(f'<text x="{b["x"]+b["w"]-10}" y="{ty}" text-anchor="end" font-size="11.5" fill="#64748b">{c["tipo"]}{extra}</text>')
    add('</g>')


# marcadores (pé de galinha)
def marcador(x, y, sentido, kind):
    """sentido: +1 = linha sai para a direita da borda (borda esquerda->fora ... ) em coords: a linha
    se afasta da caixa no sentido `sentido` (+1 direita, -1 esquerda).
    kind: 'um' (||), 'zero_um' (o|), 'muitos' (o<), 'um_um_opcional'
    """
    s = sentido
    cor = "#334155"
    o = []
    if kind in ("um", "zero_um"):
        o.append(f'<line x1="{x+s*10}" y1="{y-7}" x2="{x+s*10}" y2="{y+7}" stroke="{cor}" stroke-width="1.8"/>')
        if kind == "um":
            o.append(f'<line x1="{x+s*16}" y1="{y-7}" x2="{x+s*16}" y2="{y+7}" stroke="{cor}" stroke-width="1.8"/>')
        else:
            o.append(f'<circle cx="{x+s*20}" cy="{y}" r="5" fill="#fff" stroke="{cor}" stroke-width="1.8"/>')
    elif kind == "muitos":
        o.append(f'<path d="M {x+s*14} {y} L {x} {y-8} M {x+s*14} {y} L {x} {y+8} M {x+s*14} {y} L {x} {y}" '
                 f'stroke="{cor}" stroke-width="1.8" fill="none"/>')
        o.append(f'<circle cx="{x+s*22}" cy="{y}" r="5" fill="#fff" stroke="{cor}" stroke-width="1.8"/>')
    elif kind == "um_unico":  # lado filho com UNIQUE: no máximo um
        o.append(f'<line x1="{x+s*10}" y1="{y-7}" x2="{x+s*10}" y2="{y+7}" stroke="{cor}" stroke-width="1.8"/>')
        o.append(f'<circle cx="{x+s*20}" cy="{y}" r="5" fill="#fff" stroke="{cor}" stroke-width="1.8"/>')
    return "".join(o)


for rt, seg in CONECT:
    r = rt["rel"]
    fx, fy = rt["pf"]
    px, py = rt["pp"]
    sf = -1 if rt["lf"] == "L" else 1
    sp = -1 if rt["lp"] == "L" else 1
    add(marcador(fx, fy, sf, "um_unico" if r["uq"] else "muitos"))
    add(marcador(px, py, sp, "zero_um" if r["opc"] else "um"))

# rodapé
fy = ALT - 56
add(f'<line x1="{PX}" y1="{fy-18}" x2="{LARG-PX}" y2="{fy-18}" stroke="#e2e8f0"/>')
add(f'<text x="{PX}" y="{fy}" font-size="14" fill="#334155" font-weight="700">Notação (pé de galinha):</text>')
x0 = PX + 215
add(marcador(x0 + 40, fy - 5, -1, "um"))
add(f'<line x1="{x0+40}" y1="{fy-5}" x2="{x0+90}" y2="{fy-5}" stroke="#64748b" stroke-width="1.6"/>')
add(marcador(x0 + 90, fy - 5, 1, "muitos"))
add(f'<text x="{x0+135}" y="{fy}" font-size="13.5" fill="#334155">um (obrigatório) para muitos</text>')
x1 = x0 + 400
add(marcador(x1 + 40, fy - 5, -1, "zero_um"))
add(f'<line x1="{x1+40}" y1="{fy-5}" x2="{x1+90}" y2="{fy-5}" stroke="#64748b" stroke-width="1.6"/>')
add(marcador(x1 + 90, fy - 5, 1, "muitos"))
add(f'<text x="{x1+135}" y="{fy}" font-size="13.5" fill="#334155">zero ou um (FK opcional) para muitos</text>')
add(f'<text x="{PX}" y="{fy+24}" font-size="13" fill="#64748b">Além das 32 tabelas, o banco possui 15 views somente leitura '
    f'(prefixo v_) usadas pelo Assistente de IA. PK = chave primária · FK = chave estrangeira · UQ = valor único.</text>')
add('</svg>')

open(SAIDA + ".svg", "w", encoding="utf-8").write("\n".join(S))
print("ok", LARG, ALT)


# ------------------------------------------------------------------- PNG
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(viewport={"width": LARG, "height": ALT}, device_scale_factor=1.5)
        pg.goto("file://" + os.path.abspath(SAIDA + ".svg"))
        pg.screenshot(path=SAIDA + ".png")
        nav.close()
    print("png gerado")
except Exception as e:  # sem playwright: so o SVG
    print("PNG nao gerado (", type(e).__name__, "). O SVG foi gerado normalmente.")
