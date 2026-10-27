# CLAUDE.md — sist_gest_est_mon (Nova Sorvetes)

Contexto do projeto para o Claude Code. Leia inteiro antes de mexer em qualquer coisa.
Quando algo aqui divergir do código, **o código vence**: confira antes de afirmar.

## O que é
TCC da UniFAJ (Matheus Franco + grupo): sistema de gestão de estoque, pedidos, produção e financeiro para a
**Nova Sorvetes** (sorveteria de Itapira/SP). Backend e frontend completos, empacotado em Docker.
Estado atual: em testes manuais com dados reais, antes da apresentação do TCC.

## Stack
- Backend: FastAPI, SQLAlchemy 2, Pydantic v2, Alembic, MySQL 8, JWT (python-jose) + bcrypt, ReportLab (PDFs).
- Frontend: HTML/CSS/JS puro (sem framework, sem bundler), servido por nginx.
- Docker Compose (projeto `nova-sorvetes`): `db` (mysql:8.0, porta do host 3307), `backend` (python:3.12-slim, 8000),
  `frontend` (nginx, 8080). O entrypoint do backend espera o banco, roda `alembic upgrade head`, `docker/preparar_banco.py` e o uvicorn.
- Assistente de IA opcional (Gemini via `GEMINI_API_KEY` no `.env`), com usuário MySQL somente leitura.

## Comandos (PowerShell, na raiz do repositório)
```
docker compose up -d --build                                   # produção local (imagens embutem o código: rebuild a cada mudança)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build   # dev: bind mount + --reload
docker compose exec backend alembic revision --autogenerate -m "descricao"
docker compose exec backend alembic upgrade head
docker compose logs -f backend
docker compose down            # NUNCA use down -v sem avisar: apaga banco e fotos
python backend/scripts/gerar_der.py   # regenera o DER (PNG/SVG) a partir de models.py
```
`.env` só é lido quando o container é criado (mudou o `.env` → `docker compose up -d`).
Revise sempre a migration autogerada antes de aplicar. Senhas com `%` no DB exigem `%%` no alembic.

## Estrutura
```
backend/  main.py, database.py, models.py, routes/ (um arquivo por módulo), schemas/ (Pydantic), core/ (regras de negócio
          reutilizáveis: estoque, pedidos, receita, financeiro, relatorios*, pdf, permissoes, security, assistente/),
          alembic/versions/, scripts/, docker/ (entrypoint e preparar_banco.py)
frontend/ pages/*.html, js/core (config, api, auth, mascaras, formatadores), js/components (sidebar, feedback, ...),
          js/services/*Service.js (só chamadas à API), js/pages/*.js (UI), css/
```

## Convenções que NÃO devem ser quebradas
**Backend**
- Validação de formato = Pydantic (422). Regra de negócio = rota/core (400). Mensagens em português.
- Soft delete (`ativo`) em tudo, exceto cotações e registros de manutenção de geladeira (hard delete).
  Nome duplicado é proibido mesmo se o registro existente estiver inativo.
- Edição parcial (PUT): só o que foi enviado muda; campos opcionais aceitam `null` para apagar o valor
  (`model_dump(exclude_unset=True)` + lista de campos anuláveis), os obrigatórios ignoram `null`.
- Quantidades são `Numeric(12,3)` (alias `QTD` em models.py); dinheiro ainda é `Float` (decisão consciente, não migrar sem pedir).
- Concorrência de estoque: sempre `core.estoque.travar_produtos` (SELECT ... FOR UPDATE, ids em ordem crescente) antes de
  mexer em `estoque_atual` / `estoque_reservado`. Venda sem estoque bloqueia (400); produz-se antes por ordem de produção.
- `preco_venda = preco_custo * (1 + porcentagem/100)`, calculado e gravado pelo backend. Compra não altera `preco_custo`;
  ordem de produção guarda o custo na confirmação mas não sobrescreve o do produto.
- Receita: uma por produto; consumo = `quantidade_do_item * (qtd_produzida / rendimento)`, arredondado para cima na 3ª casa
  (`core/receita.py`). Cancelar ordem confirmada só se houver saldo para devolver.
- Pedido de compra recebe parcial/cumulativo (`quantidade_recebida`).
- Permissões: 15 códigos `modulo.ver|editar`, aplicados por router (`core/permissoes.py`: `exigir`, `exigir_admin`).
  Grupos padrão Gerência/Operacional/Consulta; 1 grupo por usuário + permissões extras que só concedem.
  Leitura de cadastros liberada a qualquer logado. Admin passa em tudo.
- Auth: senha de 8 a 72 **bytes**. `usuario.senha_alterada_em` + claim `iat` do JWT revogam sessões antigas
  (troca de senha e redefinição pelo admin). `PUT /auth/senha` troca a própria senha.
  Grave `senha_alterada_em` SEM microssegundos: o MySQL arredonda DATETIME(0) e o token novo seria recusado.
- Assistente de IA: só SELECT, só nas views `v_*` (15 views criadas por migration), com as permissões do próprio usuário;
  cada ferramenta acionada vira linha em `assistente_log`; `GET /assistente/auditoria[/resumo]` é só admin.
- Mudou `models.py` → migration Alembic + atualizar o DER + README (contagem de tabelas/relacionamentos).
- Se a mudança afeta colunas usadas pelas views `v_*` ou pelo `core/assistente/esquema.py`, atualize-os (o assistente descreve o schema ali).

**Frontend**
- Camadas: `services/` só fala com a API; `pages/` só UI e chama services. Scripts clássicos carregados por página, na ordem
  (config, api, auth, formatadores, sidebar, feedback, service, page).
- `apiFetch` (api.js) trata 401 (limpa token e vai ao login) e traduz 422 com `ROTULOS_CAMPOS`. Use `toast`/`confirmarAcao` (feedback.js).
- Sempre `escaparHtml()` ao injetar texto do banco em innerHTML.
- Menu: array `ITENS_MENU` em `sidebar.js` (`apenasAdmin`, `permissao`, `tambem`). Páginas admin chamam `exigirAdmin()`.
- Modais: CSS base em `listagem-crud.css` (nem toda página o carrega: componentes novos devem ter CSS autossuficiente).
- Problema conhecido e antigo: no celular o menu lateral abre por cima do conteúdo por padrão.

## Arquivos e finais de linha
Repositório no Windows (CRLF). `.gitattributes` força LF só em `*.sh`, `Dockerfile`, `*.conf`, `docker-compose*.yml`,
`.dockerignore`, `.env.example` (lidos por Linux dentro dos containers). Ao editar esses, mantenha LF.
Nginx usa `absolute_redirect off;` por causa da porta 8080→80.

## Modelo de dados (resumo)
32 tabelas: usuário/grupo/permissão, categoria/subcategoria/unidade_medida/produto, cliente/fornecedor (+endereços),
geladeira (+histórico de manutenção), pedido_venda/compra e itens, cotação (compra e venda, converte em pedido),
receita/ordem_produção, financeiro (títulos, baixas, categorias, formas de pagamento com parcelas), assistente (conversa, mensagem, log).
Produto tem `e_insumo` e `e_vendavel` (independentes; vender só-insumo é permitido, pode ser revenda).
Status da geladeira: `em_campo` | `manutencao` | `desativada`.

## Como trabalhar com o Matheus
- Ele quer você como **arquiteto de software crítico**: aponte riscos, recomende contra over-engineering, dê comandos e caminhos exatos.
- **Design antes de código**: para qualquer funcionalidade nova, primeiro uma mensagem curta com impacto nos módulos e as decisões
  em aberto (opções + recomendação) e espere o "Siga"/"Concordo" dele. Um passo por vez, sem rodadas infinitas de teste.
- Explicações técnicas, mas em português simples. Backend primeiro, depois front.
- Entregue testes que você mesmo rodou; roteiros de teste manual completos, com JSON pronto para colar.
- **Não mencione "artigo" no README.**
- Commits em português, no estilo `feat(modulo): resumo` com corpo em lista. Ele mesmo faz o commit; não dê push.
- Ao concluir, diga o que mudou, como testar na interface e quais arquivos foram alterados.

## Pendências conhecidas
- Chave do Gemini foi exposta em conversa anterior: rotacionar.
- `SECRET_KEY`/`ALGORITHM` não têm default (poderia haver checagem na inicialização); CORS está `*`; não há limite de tentativas de login.
- DER: o SVG é regenerado por `python backend/scripts/gerar_der.py`; o PNG exige `playwright` instalado localmente.

## Embalagem do produto (fator de conversão)
- `produto.unidade_medida_id` = unidade BASE (estoque, estoque mínimo, receitas). Opcional: `embalagem_unidade_id` + `fator_embalagem` (sem embalagem, fator = 1; com embalagem, fator ≠ 1 e unidade ≠ base).
- Itens de pedido de venda, pedido de compra e cotação guardam `quantidade` NA EMBALAGEM + cópia do `fator` do momento.
- Toda movimentação de estoque converte com `core.estoque.quantidade_base(quantidade, fator)`; nunca multiplique à mão em outro lugar.
- `preco_custo`/`preco_venda` são por embalagem; receitas e produção usam `produto.custo_unidade_base`.
- Aprovação de cotação é bloqueada se o fator do produto mudou desde a cotação. Rankings trabalham na unidade base.
- Frontend: `fatorEmbalagem`, `siglaNegociacao`, `textoQuantidadeItem` e `textoEstoque` em `js/core/formatadores.js`.
