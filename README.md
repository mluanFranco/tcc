# Sistema de Gestão de Estoque e Monitoramento de Equipamentos

Sistema de gestão desenvolvido para a empresa [Nova Sorvetes](https://www.instagram.com/nova_sorvetes/), localizada em Itapira – SP, com o objetivo de substituir o controle manual por planilhas por uma solução informatizada, centralizada e rastreável: estoque, compras, vendas, produção, financeiro, equipamentos refrigerados e um assistente de IA para consultas em linguagem natural.

![Logo Nova Sorvetes](frontend/assets/images/logo-novasorvetes.png)

> **Status do projeto:** backend, frontend (todas as telas) e empacotamento em Docker concluídos. O sistema inteiro sobe com `docker compose up`.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Módulos do Sistema](#módulos-do-sistema)
- [Modelo de Dados](#modelo-de-dados)
- [Regras de Negócio](#regras-de-negócio)
- [Arquitetura](#arquitetura)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Como Executar com Docker (recomendado)](#como-executar-com-docker-recomendado)
- [Como Executar sem Docker](#como-executar-sem-docker)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Migrações de Banco de Dados (Alembic)](#migrações-de-banco-de-dados-alembic)
- [Assistente de IA](#assistente-de-ia)
- [Solução de Problemas](#solução-de-problemas)
- [Roadmap](#roadmap)
- [Sobre o Projeto](#sobre-o-projeto)
- [Stack Utilizada](#stack-utilizada)

---

## Visão Geral

O sistema entrega uma solução funcional para o controle da operação de uma fábrica de sorvetes e do monitoramento dos equipamentos refrigerados (geladeiras e freezers) alocados nos clientes. Com ele, é possível:

- Controlar entradas e saídas de produtos via pedidos de compra e de venda, com **reserva automática de estoque**;
- Cadastrar clientes (com vários endereços) e fornecedores, com preenchimento automático de endereço via CEP;
- Registrar **cotações** de compra e de venda, comparar preços entre fornecedores e aprovar a cotação gerando o pedido;
- Cadastrar **formas de pagamento** com parcelas e taxas, que geram automaticamente as contas a pagar e a receber;
- Controlar o **financeiro**: títulos a pagar e a receber, baixas parciais com estorno, lançamentos avulsos e recorrentes;
- Cadastrar **receitas** e registrar **ordens de produção** que consomem insumos e dão entrada no produto fabricado, com custo calculado;
- Acompanhar o **dashboard** com receita, margem, resultado, caixa, previsão, inadimplência e rankings;
- Acompanhar os equipamentos alocados em cada cliente e o histórico de manutenção;
- Gerar **PDFs** de cotações e pedidos;
- Controlar o acesso por **grupos de permissões** (por módulo) e permissões extras por usuário;
- Fazer perguntas sobre os dados ao **Assistente de IA**, que só enxerga o que o usuário já poderia ver nas telas.

---

## Módulos do Sistema

| Módulo | Responsabilidade | Status |
|---|---|---|
| **Autenticação e acesso** | Login via JWT; grupos de acesso com permissões por módulo, permissões extras por usuário e perfil administrador | ✅ Completo |
| **Usuários** | Cadastro, grupo, administrador, permissões extras e foto de perfil (somente administrador) | ✅ Completo |
| **Cadastros** | Produtos (insumos e vendáveis), categorias, subcategorias, unidades de medida, clientes e fornecedores | ✅ Completo |
| **Pedidos de venda e de compra** | Reserva de estoque na venda, recebimento parcial na compra, endereço de entrega, geração de títulos | ✅ Completo |
| **Cotações** | Cotações de compra e de venda, comparativo de preços por produto e aprovação que gera o pedido | ✅ Completo |
| **Formas de pagamento** | Parcelas com prazo e percentual, taxa da modalidade | ✅ Completo |
| **Produção** | Receitas (com simulação) e ordens de produção com consumo de insumos e custo congelado | ✅ Completo |
| **Financeiro** | Contas a pagar e a receber, baixas parciais, estornos, categorias financeiras e lançamentos avulsos | ✅ Completo |
| **Dashboard e relatórios** | Resumo por competência, série mensal, comparativo, caixa realizado e previsto, inadimplência e rankings | ✅ Completo |
| **Geladeiras** | Equipamentos alocados em clientes e histórico de manutenção | ✅ Completo |
| **Assistente de IA** | Perguntas em linguagem natural sobre os dados, com 4 camadas de defesa e auditoria | ✅ Completo |
| **Documentos em PDF** | Cotação, pedido de venda e pedido de compra | ✅ Completo |
| **Frontend** | Interface web, redesenhada tela a tela | ✅ Completo |
| **Containerização** | Docker Compose: MySQL, API e Nginx | ✅ Completo |

---

## Modelo de Dados

O modelo relacional é composto por **32 tabelas**, distribuídas nos domínios abaixo (o schema inteiro é criado pelas migrations do Alembic):

- **Acesso:** `usuario`, `grupo_acesso`, `permissao`, `grupo_permissao`, `usuario_permissao`
- **Cadastros:** `categoria`, `subcategoria`, `unidade_medida`, `produto`, `cliente`, `cliente_endereco`, `fornecedor`, `forma_pagamento`, `forma_pagamento_parcela`
- **Vendas e compras:** `pedido_venda`, `item_pedido_venda`, `pedido_compra`, `item_pedido_compra`
- **Cotação:** `cotacao`, `item_cotacao`
- **Produção:** `receita`, `receita_item`, `ordem_producao`, `ordem_producao_item`
- **Financeiro:** `categoria_financeira`, `titulo_financeiro`, `baixa_titulo`
- **Monitoramento:** `geladeira`, `historico_manutencao`
- **Assistente de IA:** `assistente_conversa`, `assistente_mensagem`, `assistente_log`

Além das tabelas, o banco tem **15 views `v_*`** (somente leitura), que expõem os dados já com as regras de negócio aplicadas e **sem dados pessoais**. Elas são a única coisa que o Assistente de IA consegue consultar.

> O diagrama abaixo mostra as **32 tabelas** e os **57 relacionamentos** (chaves estrangeiras) do banco. Ele é gerado direto de `backend/models.py` pelo script `backend/scripts/gerar_der.py`, então reflete o schema real. A cor do cabeçalho indica o módulo; a notação é pé de galinha (`||` um, `o|` zero ou um, `o<` muitos).

![Diagrama Entidade-Relacionamento](frontend/assets/images/der_nova_sorvetes.png)

### Produto

| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `nome`, `descricao`, `categoria_id`, `subcategoria_id` | Identificação e categorização |
| `unidade_medida_id` | Unidade **base**, em que ficam o estoque, o estoque mínimo e as receitas (ex.: L) |
| `embalagem_unidade_id`, `fator_embalagem` | Embalagem opcional em que o produto é comprado e vendido, e quantas unidades base cabem nela (ex.: Pote = 5 L). Sem embalagem, o fator é 1 |
| `e_insumo`, `e_vendavel` | Define se entra em receitas (insumo) e/ou pode ser vendido |
| `preco_custo`, `porcentagem`, `preco_venda` | Precificação (por embalagem, quando houver) |
| `estoque_atual` | Quantidade física real, atualizada pelos pedidos e pela produção (até 3 casas decimais) |
| `estoque_reservado` | Quantidade comprometida em pedidos de venda ainda não confirmados |
| `estoque_minimo` | Base do alerta de estoque baixo |
| `ativo` | Soft delete |
| `created_at`, `updated_at` | Auditoria |

> O estoque disponível para venda é sempre `estoque_atual - estoque_reservado`, exposto na API como o campo computado `estoque_disponivel`.

### Cliente / Fornecedor

Dados cadastrais (`nome`, `cpf_cnpj`, `telefone`, `email`...) com validação de CPF/CNPJ, CEP, UF e DDD. O endereço é preenchido via [API ViaCEP](https://viacep.com.br/). Um cliente pode ter **vários endereços** (`cliente_endereco`), usados na entrega dos pedidos e na alocação das geladeiras. `ativo` é o soft delete.

### Pedido de Venda / Pedido de Compra

| Pedido | Status | Pontos principais |
|---|---|---|
| **Venda** | `aberto` → `confirmado` \| `cancelado` | Reserva estoque ao abrir; confirma a venda e congela o custo; endereço de entrega; forma de pagamento |
| **Compra** | `pendente` → `recebido` \| `cancelado` | Recebimento parcial e acumulativo por item; entrega prevista; forma de pagamento |

Cada pedido tem itens (`item_pedido_venda` e `item_pedido_compra`), o que evita repetir colunas no cabeçalho e mantém o modelo normalizado.

### Cotação

Cotação de **compra** (fornecedor) ou de **venda** (cliente). O ciclo muda conforme o tipo:

| Tipo | Status |
|---|---|
| **Compra** | `rascunho` → `enviada` → `recebida` → `aprovada` \| `recusada` (a cotação pode ir direto de `rascunho` a `recebida`) |
| **Venda** | `rascunho` → `enviada` → `aprovada` \| `recusada` (não há a etapa `recebida`) |

A recusa é possível em qualquer etapa antes da aprovação. Ao aprovar, o sistema gera o pedido correspondente na mesma transação. A cotação de venda guarda o endereço de entrega e a de compra, a entrega prevista.

### Forma de Pagamento

`descricao`, `taxa_percentual` e uma lista de **parcelas** (`prazo_dias` e `percentual`). As parcelas viram os vencimentos dos títulos financeiros.

### Produção

- **Receita:** produto fabricado, `rendimento` e itens (insumo + quantidade).
- **Ordem de produção:** `aberta` → `confirmada` \| `cancelada`; na confirmação grava o consumo real de cada insumo, o `custo_total` e o `custo_unitario`.

### Financeiro

- **Título financeiro:** uma parcela a pagar (compra) ou a receber (venda), ou um lançamento avulso (aluguel, energia, outras receitas...). Status `aberto` → `parcial` → `pago` \| `cancelado`.
- **Baixa:** pagamento ou recebimento, total ou parcial. O estorno não apaga: marca a baixa como estornada.

### Usuário e grupos de acesso

`usuario` (`nome`, `email`, `senha_hash` com bcrypt, `ativo`, `admin`, `grupo_id`, `foto`), `grupo_acesso` e as permissões efetivas. Veja [Controle de acesso](#controle-de-acesso).

### Geladeira / Histórico de Manutenção

O endereço da geladeira vem de um dos endereços do cliente ao qual ela está alocada. O `status` é `em_campo` \| `manutencao` \| `desativada`. Cada manutenção (`historico_manutencao`) registra data, tipo, descrição e custo.

---

## Regras de Negócio

Estas são as decisões de design que vão além de um CRUD simples e representam grande parte do valor técnico do projeto.

### Reserva de estoque em pedidos de venda

Sem controle de concorrência, dois pedidos abertos ao mesmo tempo para o mesmo produto poderiam, juntos, vender mais do que existe em estoque. Por isso o produto mantém dois contadores:

- `estoque_atual`: quantidade física real (só muda na efetiva entrada ou saída de mercadoria);
- `estoque_reservado`: soma das quantidades comprometidas em pedidos de venda `aberto`.

| Transição | Efeito no estoque |
|---|---|
| Criar pedido (`→ aberto`) | Valida `estoque_atual - estoque_reservado`; incrementa `estoque_reservado` |
| `aberto → confirmado` | Libera a reserva e debita o físico; congela o custo dos itens; gera as contas a receber |
| `aberto → cancelado` | Libera a reserva, sem afetar o físico |
| `confirmado → cancelado` | Devolve o físico e cancela os títulos (bloqueia se já houve recebimento) |

As linhas de produto são travadas (`SELECT ... FOR UPDATE`) durante a operação, então duas requisições simultâneas nunca reservam o mesmo saldo.

### Embalagem e fator de conversão

Um produto pode ser negociado numa embalagem diferente da unidade em que é controlado, como um pote de 5 L ou um saco de 10 kg. O cadastro guarda a unidade base (L), a embalagem (Pote) e o fator (5):

- **Pedidos e cotações** são digitados na embalagem (2 Pote) e aceitam fração (0,5 Pote). Cada item grava uma cópia do fator do momento (`fator`), então mudar o cadastro depois não altera pedidos antigos;
- **Estoque, estoque mínimo e receitas** ficam sempre na unidade base. Toda entrada e saída converte por `quantidade × fator` em um único ponto (`core/estoque.py → quantidade_base`): comprar 4 potes soma 20 L ao estoque;
- **Preços** de custo e de venda são por embalagem. Receitas e produção usam o custo da unidade base (`preco_custo ÷ fator`), e o custo congelado na venda é calculado com o fator do item;
- **Cotação aprovada** é bloqueada se a embalagem do produto mudou depois que ela foi feita, para não gerar um pedido com quantidades erradas. O comparativo de fornecedores compara pelo preço na unidade base;
- Os relatórios de ranking mostram quantidades e preços na unidade base, e os PDFs mostram a embalagem do item (ex.: "Pote (5 L)").

### Recebimento parcial e acumulativo em pedidos de compra

Cada item rastreia `quantidade` (pedida) separadamente de `quantidade_recebida` (acumulado). O endpoint `POST /pedidos-compra/{id}/receber` pode ser chamado várias vezes, sempre com a quantidade **daquela entrega**. O pedido fica `pendente` até todos os itens completarem a quantidade pedida e então vira `recebido` automaticamente. O cancelamento estorna do estoque exatamente o que foi recebido, com validação para não deixar o estoque negativo. As contas a pagar nascem junto com o pedido.

### Cotações

A comparação de preços considera só cotações de **compra** já respondidas (`recebida` ou `aprovada`) e itens com preço. A aprovação gera o pedido (compra ou venda, reservando estoque) **em uma única transação**: se o pedido não puder ser criado, por exemplo uma venda sem estoque, nada é gravado.

### Financeiro: títulos e baixas

- As parcelas da forma de pagamento viram títulos: a pagar na criação da compra e a receber na confirmação da venda.
- Uma baixa pode ser parcial; o título passa por `aberto → parcial → pago`. Estornar uma baixa a deixa registrada como estornada, sem apagá-la.
- Títulos e baixas são alterados com a linha do título travada, então duas baixas simultâneas nunca passam do saldo e uma baixa nunca atravessa o cancelamento do pedido.
- Títulos de pedido só são cancelados junto com o pedido; lançamentos avulsos podem ser editados e cancelados enquanto estiverem abertos e sem baixa. Lançamentos podem ser recorrentes (`1/N`, `2/N`...).

### Produção

O consumo de cada insumo é `quantidade_do_item × (quantidade_a_produzir ÷ rendimento)`, **arredondado para cima** na 3ª casa decimal: na dúvida, consome-se um milésimo a mais, nunca a menos. A mesma função alimenta a simulação da receita e a ordem de produção, então os dois sempre dão o mesmo número.

Ao **confirmar** a ordem, o sistema valida insumos e produto (ativos, e insumo marcado como tal), confere o saldo disponível de cada insumo, debita os insumos, dá entrada no produto fabricado e **congela** o consumo e o custo (`custo_total` e `custo_unitario`). Ordem aberta mostra apenas uma prévia. Cancelar uma ordem confirmada devolve os insumos e retira o produto fabricado (só se ele ainda tiver saldo para isso).

### Relatórios e dashboard

Os relatórios do financeiro seguem o **regime de competência**, a partir de uma única coleta de dados, de modo que o resumo e a série mensal sempre fecham:

- A venda conta quando **confirmada**; receita = subtotal dos itens (já com desconto);
- **CMV** = quantidade × custo unitário congelado na confirmação; margem bruta = receita − CMV;
- As compras aparecem como **investimento em estoque** e não entram no resultado, porque só viram custo quando o produto é vendido;
- Despesas e outras receitas = lançamentos avulsos não cancelados;
- **Resultado** = margem bruta + outras receitas − despesas.

Também existem o **fluxo de caixa realizado** (regime de caixa, pelas baixas e com a taxa estimada da forma de pagamento), o **fluxo previsto** (títulos em aberto por vencimento, com o que já venceu à parte), a **inadimplência por faixa de atraso** e os **rankings** de produtos, clientes e fornecedores. O Dashboard consome esses endpoints e mostra os destaques gerados a partir dos próprios números.

### Controle de acesso

- **Catálogo de 15 permissões**, no formato `<módulo>.<ver|editar>`. Os módulos são `cadastros`, `geladeiras`, `vendas`, `compras`, `cotacoes`, `producao`, `financeiro`, `relatorios` e `assistente`. `editar` já inclui `ver`.
- **Cadastros só tem `editar`:** a leitura dos cadastros é liberada a qualquer usuário logado, porque as telas de venda, compra e produção precisam listar produtos, clientes e fornecedores.
- **Permissão efetiva** = permissões do grupo (se ativo) + permissões extras do usuário. O administrador tem tudo, independentemente de grupo.
- **Grupos padrão** criados pelas migrations: *Gerência* (tudo), *Operacional* (operação, sem financeiro e relatórios) e *Consulta* (somente leitura operacional).
- Cada usuário pode **trocar a própria senha** (pedindo a senha atual); a troca encerra as sessões abertas em outros dispositivos.
- Proteções: um administrador não desativa a própria conta nem remove a própria permissão de administrador; o sistema nunca fica sem administrador ativo; um grupo com usuários ativos não pode ser desativado.
- A proteção é aplicada em **dois níveis**: no frontend (redirecionamento e itens do menu) e no backend (cada router exige a permissão do seu módulo: `401` = não autenticado, `403` = sem permissão).

### Soft delete e auditoria

Cadastros (produtos, categorias, subcategorias, unidades de medida, clientes, fornecedores, formas de pagamento), receitas, categorias financeiras, usuários e grupos nunca são removidos: são marcados como `ativo = False`, preservando o histórico. Cada módulo expõe a consulta de inativos (`/inativos`) e a reativação, por `PATCH .../reativar` ou pela própria edição (`ativo: true`). Cotações e registros de manutenção, por não estarem ligados a transações efetivadas, permitem exclusão real. O Assistente de IA registra **toda** chamada em `assistente_log`, consultável pelos administradores na tela de auditoria do assistente.

---

## Arquitetura

```
Navegador
   │
   ▼
Frontend (HTML/CSS/JS puro, servido pelo Nginx)  ──►  http://localhost:8080
   │  requisições HTTP/JSON com token JWT
   ▼
Backend (FastAPI)                                 ──►  http://localhost:8000  (Swagger em /docs)
   ├── routes/      → Endpoints REST, um arquivo por módulo
   ├── schemas/     → Validação de entrada e saída (Pydantic v2)
   ├── core/        → Regras de negócio, segurança (JWT), PDFs, relatórios e assistente de IA
   └── models.py    → Mapeamento ORM (SQLAlchemy 2)
   │
   ▼
Banco de Dados (MySQL 8)                          ──►  localhost:3307 (opcional, para ferramentas externas)
```

No frontend, cada tela tem seu HTML em `pages/`, sua lógica em `js/pages/` e uma camada `js/services/` que concentra todas as chamadas à API. Componentes compartilhados (menu lateral, modais, gráficos em SVG, seletor de permissões) ficam em `js/components/`.

---

## Estrutura de Pastas

```
sist_gest_est_mon/
├── backend/
│   ├── alembic/                   # Migrações de schema do banco de dados
│   │   └── versions/
│   ├── core/                      # Regras de negócio e infraestrutura
│   │   ├── assistente/            # Assistente de IA (orquestrador, SQL seguro, defesas, provedor)
│   │   ├── security.py            # Autenticação JWT
│   │   ├── permissoes.py          # Catálogo de permissões e dependências das rotas
│   │   ├── pedidos.py, estoque.py, financeiro.py, receita.py, pagamento.py
│   │   └── relatorios*.py, pdf.py, foto.py, validacoes.py
│   ├── docker/                    # Script de entrada e preparação do banco (usado pelo Docker)
│   ├── routes/                    # Endpoints da API, um arquivo por módulo
│   ├── schemas/                   # Modelos Pydantic de entrada e saída
│   ├── scripts/                   # Avaliação do assistente, gerador do DER e scripts de apoio
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── database.py                # Conexão com o MySQL
│   ├── models.py                  # Modelos ORM (SQLAlchemy)
│   ├── main.py                    # Inicialização da aplicação FastAPI
│   └── requirements.txt           # Dependências do projeto
├── frontend/
│   ├── assets/images/             # Logotipos, ilustração do login e o DER
│   ├── css/                       # Folhas de estilo (base, sidebar e uma por tela)
│   ├── js/
│   │   ├── core/                  # api.js, auth.js, config.js, formatadores.js, mascaras.js
│   │   ├── components/            # sidebar, feedback, gráficos, modais e formulários compartilhados
│   │   ├── pages/                 # Lógica específica de cada tela
│   │   └── services/              # Comunicação com a API (um arquivo por módulo)
│   └── pages/                     # HTML de cada tela
├── docker/
│   └── frontend/                  # Dockerfile e nginx.conf do frontend
├── backups/                       # Dumps do banco (não versionados)
├── docker-compose.yml             # Modo "pronto para rodar" (banca/produção)
├── docker-compose.dev.yml         # Complemento para desenvolver com recarga automática
├── .env.example                   # Modelo das variáveis do Docker
├── .dockerignore
├── .gitattributes
├── .gitignore
└── README.md
```

---

## Como Executar com Docker (recomendado)

Este passo a passo parte de um computador **sem nada instalado**. Os comandos são para o **Windows** (PowerShell); quando o comando for diferente no Linux ou no Mac, ele aparece ao lado como comentário.

O sistema roda inteiro dentro do Docker: banco de dados (MySQL), API (FastAPI) e telas (Nginx). Você **não** precisa instalar o MySQL. O Python e o ambiente virtual servem para o editor reconhecer o código, gerar a chave secreta do `.env` e rodar os scripts auxiliares (como o que gera o diagrama do banco).

| O que instalar | Para quê |
|---|---|
| Git | Baixar (clonar) o projeto e receber as atualizações |
| Python 3.12 | Ambiente virtual, chave secreta e scripts auxiliares |
| Docker Desktop | Rodar o sistema (banco, API e telas) |

> **Como abrir o PowerShell:** aperte a tecla **Windows**, digite `PowerShell` e tecle Enter. Depois de instalar um programa, **feche e abra o PowerShell de novo** para ele reconhecer os comandos novos.

### Passo 1: Instalar o Git

1. Baixe o instalador em [git-scm.com/downloads](https://git-scm.com/downloads) e instale com as opções padrão (é só ir clicando em *Next*).
   Ou, pelo PowerShell: `winget install --id Git.Git -e`
2. Confira a instalação:

```powershell
git --version        # deve mostrar algo como: git version 2.x
```

> Linux (Ubuntu/Debian): `sudo apt install git` · Mac: `xcode-select --install`

### Passo 2: Instalar o Python

1. Baixe o **Python 3.12** em [python.org/downloads](https://www.python.org/downloads/).
2. Na primeira tela do instalador, **marque a opção "Add python.exe to PATH"** e clique em *Install Now*.
   Ou, pelo PowerShell: `winget install --id Python.Python.3.12 -e`
3. Confira a instalação:

```powershell
python --version     # deve mostrar: Python 3.12.x
pip --version
```

> Se o comando `python` abrir a Microsoft Store, desative o atalho em **Configurações → Aplicativos → Configurações avançadas de aplicativos → Aliases de execução de aplicativo** (desligue "python.exe" e "python3.exe") e abra o PowerShell de novo.
>
> Linux: `sudo apt install python3 python3-venv python3-pip` · Mac: instalador do python.org (use `python3` e `pip3` nos comandos)

### Passo 3: Instalar o Docker Desktop

1. **Só no Windows:** o Docker usa o WSL 2. Abra o PowerShell **como administrador** (botão direito → *Executar como administrador*), rode o comando abaixo e **reinicie o computador**:

```powershell
wsl --install
```

2. Baixe e instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) com as opções padrão (deixe marcado *Use WSL 2*). Reinicie se o instalador pedir.
3. Abra o **Docker Desktop** e espere aparecer *Engine running* no canto inferior esquerdo. Ele precisa estar aberto sempre que for usar o sistema.
4. Confira a instalação:

```powershell
docker --version
docker compose version
```

> Linux: siga o guia oficial do [Docker Engine](https://docs.docker.com/engine/install/) (o plugin `docker compose` vem junto) · Mac: instale o Docker Desktop para Mac (Apple Silicon ou Intel, conforme o seu processador).

### Passo 4: Clonar o repositório

Escolha a pasta onde o projeto vai ficar (por exemplo, `Documentos`) e baixe o código:

```powershell
cd $HOME\Documents                                   # Linux/Mac: cd ~/Documents
git clone https://github.com/mluanFranco/tcc.git
cd tcc
```

A partir daqui, **todos os comandos são rodados dentro da pasta `tcc`** (a raiz do repositório).

### Passo 5: Criar o ambiente virtual e instalar as dependências

O ambiente virtual (`venv`) é uma pasta com um Python só deste projeto, para as bibliotecas dele não se misturarem com as de outros programas.

```powershell
python -m venv venv                                  # cria a pasta venv na raiz do projeto
.\venv\Scripts\Activate.ps1                          # ativa (Linux/Mac: source venv/bin/activate)
python -m pip install --upgrade pip
pip install -r backend/requirements.txt              # instala as bibliotecas do backend
```

Com o ambiente ativo, o começo da linha do PowerShell mostra `(venv)`. Para desativar, digite `deactivate`. Sempre que abrir um PowerShell novo para usar os scripts do projeto, ative de novo com `.\venv\Scripts\Activate.ps1`.

> Se aparecer *"a execução de scripts foi desabilitada neste sistema"*, libere os scripts para o seu usuário e tente ativar de novo:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
>
> No VS Code, escolha esse Python em **Ctrl+Shift+P → Python: Select Interpreter → `.\venv\Scripts\python.exe`**.

### Passo 6: Configurar o `.env`

O `.env` guarda as senhas e configurações do sistema. Ele **nunca** vai para o Git: cada computador tem o seu.

1. Crie o arquivo a partir do modelo:

```powershell
Copy-Item .env.example .env                          # Linux/Mac: cp .env.example .env
```

2. Gere uma chave secreta (usada para assinar os logins) e copie o resultado:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

3. Abra o `.env` para editar:

```powershell
notepad .env                                         # ou: code .env  (VS Code)
```

4. Troque, no mínimo, estes valores e salve o arquivo:

| Variável | O que colocar |
|---|---|
| `DB_PASSWORD` | Senha do usuário do banco usado pelo sistema |
| `MYSQL_ROOT_PASSWORD` | Senha do administrador do MySQL |
| `SECRET_KEY` | A chave gerada no item 2 |
| `ADMIN_EMAIL` | E-mail do primeiro usuário administrador (é o seu login) |
| `ADMIN_SENHA` | Senha desse administrador (de 8 a 72 caracteres) |
| `IA_DB_PASSWORD` | Senha do usuário somente leitura do assistente de IA |

**Regras importantes:**
- Use senhas **só com letras e números**, sem `$ % # " ' \` ou espaços;
- `DB_USER` **não** pode ser `root`;
- As senhas do banco são gravadas na **primeira** vez que o sistema sobe. Para trocá-las depois, veja [Solução de Problemas](#solução-de-problemas);
- O assistente de IA é opcional e começa desligado. Para ligar, preencha `GEMINI_API_KEY` e mude `IA_HABILITADO=true` (veja [Assistente de IA](#assistente-de-ia)).

As demais variáveis estão explicadas em [Variáveis de Ambiente](#variáveis-de-ambiente).

### Passo 7: Subir o sistema

Com o Docker Desktop aberto, na raiz do projeto:

```powershell
docker compose up -d --build
```

Na primeira vez o Docker baixa as imagens e monta o sistema, o que leva alguns minutos. Ao iniciar, o backend espera o banco ficar pronto, cria as tabelas (migrations), cria o usuário somente leitura do assistente de IA e o administrador inicial (só se o banco ainda não tiver nenhum usuário).

Confira se os três serviços estão de pé:

```powershell
docker compose ps                                    # db e backend devem aparecer como "healthy"
docker compose logs -f backend                       # acompanha o log (Ctrl+C sai do log; o sistema continua rodando)
```

### Passo 8: Acessar o sistema

| Serviço | Endereço |
|---|---|
| Sistema (telas) | http://localhost:8080 (abre o login) |
| API e documentação (Swagger) | http://localhost:8000/docs |
| MySQL (opcional, para DBeaver, Workbench etc.) | `localhost:3307`, com o `DB_USER` e o `DB_PASSWORD` do `.env` |

Entre com o `ADMIN_EMAIL` e a `ADMIN_SENHA` que você definiu no `.env`. Depois, cadastre os demais usuários pela tela **Usuários**.

### Atualizar para a versão mais nova do repositório

```powershell
git pull                                             # baixa as mudanças
docker compose up -d --build                         # reconstrói e sobe (as migrations novas são aplicadas sozinhas)
pip install -r backend/requirements.txt              # só se o requirements.txt mudou (com o venv ativo)
```

Os dados do banco e as fotos ficam guardados nos volumes do Docker e **não** se perdem ao atualizar.

### Comandos do dia a dia

```powershell
docker compose ps                       # situação dos containers
docker compose logs -f backend          # log da API
docker compose stop                     # para (mantém os dados)
docker compose up -d                    # sobe de novo
docker compose down                     # remove os containers (os dados continuam nos volumes)
docker compose down -v                  # CUIDADO: apaga também o banco e as fotos
docker compose up -d --build            # reconstrói as imagens após mudar o código (modo padrão)
```

Os containers usam `restart: unless-stopped`: voltam sozinhos quando o Docker Desktop abre, a não ser que você os tenha parado. Também é possível iniciar e parar o grupo `nova-sorvetes` pela aba **Containers** do Docker Desktop (os botões ▶ e ■).

### Modo desenvolvimento (código espelhado e recarga automática)

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

As pastas `backend/` e `frontend/` ficam espelhadas nos containers: ao salvar um `.py`, o uvicorn recarrega sozinho; no frontend basta dar F5. Só é preciso `--build` de novo se mudar o `requirements.txt` ou um Dockerfile. Nesse modo, uma migration gerada dentro do container aparece na sua pasta:

```powershell
docker compose exec backend alembic revision --autogenerate -m "descricao da mudanca"
docker compose exec backend alembic upgrade head
```

> No modo desenvolvimento, se existir um `backend/.env` local, ele também é lido dentro do container; as variáveis do `.env` da raiz têm prioridade.

### Backup e restauração do banco

```powershell
# Backup (gera backups/backup_AAAA-MM-DD.sql; arquivos backup_*.sql não são versionados)
docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --routines "$MYSQL_DATABASE" > /tmp/backup.sql'
docker compose cp db:/tmp/backup.sql backups/backup_2026-01-01.sql

# Restauração de um dump seu (substitui o conteúdo atual do banco)
docker compose cp backups/backup_2026-01-01.sql db:/tmp/restaurar.sql
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/restaurar.sql'
docker compose restart backend
```

---

## Como Executar sem Docker

**Pré-requisitos:** Python 3.12+, MySQL 8 e Git.

```bash
# 1. Clonar o repositório
git clone https://github.com/mluanFranco/tcc.git
cd tcc/backend

# 2. Criar e ativar o ambiente virtual
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# 3. Instalar as dependências
pip install -r requirements.txt

# 4. Criar o arquivo backend/.env (veja "Variáveis de Ambiente"), com DB_HOST=localhost.
#    SECRET_KEY e ALGORITHM (HS256) são obrigatórios; MYSQL_ROOT_PASSWORD e ADMIN_* são só do Docker

# 5. Criar o banco de dados no MySQL
# CREATE DATABASE sist_gest_est_mon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 6. Criar as tabelas, as views e os dados de base (grupos, permissões, categorias financeiras)
alembic upgrade head

# 7. Subir o servidor
uvicorn main:app --reload
```

A documentação interativa da API fica em `http://127.0.0.1:8000/docs`.

**Primeiro usuário:** com o banco sem nenhum usuário, o `POST /usuarios/` é liberado para criar o primeiro administrador (pelo Swagger, enviando `"admin": true`). Depois disso, só administradores cadastram usuários.

**Frontend:** sirva a pasta `frontend/` por qualquer servidor HTTP estático (por exemplo, o Live Server do VS Code) e abra `pages/login.html`. O frontend procura a API na **porta 8000 do mesmo endereço** em que foi aberto.

**Assistente de IA (opcional):** crie o usuário MySQL somente leitura com `backend/scripts/criar_usuario_ia.sql` (ajuste senha e nome do banco) depois do `alembic upgrade head`, e preencha as variáveis `IA_*` e `GEMINI_API_KEY`.

---

## Variáveis de Ambiente

O modelo completo está em `.env.example` (Docker, na raiz). Sem Docker, as mesmas variáveis vão em `backend/.env`.

| Variável | Descrição |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexão com o MySQL. No Docker, `DB_HOST` é forçado para `db` |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_ROOT_USER` | Senha do root do MySQL (Docker; também usada para criar o usuário da IA). `MYSQL_ROOT_USER` é opcional (padrão `root`) |
| `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_HOURS` | Assinatura e validade do token JWT. `SECRET_KEY` e `ALGORITHM` (`HS256`) são obrigatórios; a validade padrão é 8 horas |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | Administrador inicial (Docker; criado só se não houver usuários) |
| `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_TELEFONE`, `EMPRESA_EMAIL` | Cabeçalho dos PDFs |
| `UPLOADS_DIR` | Pasta das fotos de usuários (no Docker, um volume em `/data/uploads`) |
| `IA_HABILITADO`, `GEMINI_API_KEY`, `IA_MODELO` | Liga o assistente e define a chave e o modelo |
| `IA_MODELO_RESERVA`, `IA_RACIOCINIO` | Opcionais: modelos de reserva (lista separada por vírgula, usados se o principal estiver fora do ar) e esforço de raciocínio (`low` por padrão) |
| `IA_DB_USER`, `IA_DB_PASSWORD` | Usuário MySQL somente leitura do assistente |
| `IA_MODO_PRIVADO` | `true`: os dados das consultas não são enviados ao provedor, só nomes de colunas e número de linhas |
| `IA_LIMITE_POR_HORA`, `IA_MAX_PASSOS`, `IA_MAX_LINHAS`, `IA_TIMEOUT_SEGUNDOS`, `IA_TIMEOUT_PROVEDOR` | Limites de uso, de rodadas de ferramenta, de linhas e de tempo |

---

## Migrações de Banco de Dados (Alembic)

O schema é versionado com [Alembic](https://alembic.sqlalchemy.org/): uma migration *baseline* cria o schema inteiro e as demais acrescentam os módulos seguintes, incluindo dados de base (grupos de acesso, permissões, categorias financeiras) e as views do assistente. Um banco vazio mais `alembic upgrade head` é suficiente para começar.

```bash
# Gerar uma nova migração após alterar models.py
alembic revision --autogenerate -m "descricao da mudanca"

# Revisar o arquivo gerado em alembic/versions/ antes de aplicar

# Aplicar a migração ao banco
alembic upgrade head
```

> **Nota técnica:** se a senha do banco contiver `%`, ele precisa ser escapado como `%%` na URL de conexão do `alembic/env.py`, pois o `configparser` do Python interpreta `%` como interpolação (o `env.py` já faz isso).

---

## Assistente de IA

O assistente responde perguntas em linguagem natural ("quais clientes estão com títulos vencidos?") consultando o banco por meio de um modelo de linguagem (Google Gemini). Ele foi desenhado para ser seguro mesmo que o modelo erre:

1. **Banco:** o usuário MySQL `sistema_ia` só tem `SELECT` nas 15 views, em sessão somente leitura, com limite de tempo e de linhas.
2. **Views:** documentadas, com as regras de negócio embutidas e **sem dados pessoais** (sem CPF/CNPJ, telefone, e-mail, endereço completo, senhas ou observações livres).
3. **Validador de SQL:** lista de permissões (*whitelist*). Só passa um único `SELECT` sobre as views; o SQL executado é **regerado a partir da árvore sintática**, nunca o texto original.
4. **Escopo por permissão:** cada view pertence a um módulo e exige `<módulo>.ver`, então a IA só consulta o que o usuário já veria nas telas.

Cada chamada é auditada em `assistente_log` (consulta pelo endpoint `GET /assistente/auditoria`, restrito a administradores) e há limite de perguntas por hora. O resultado das consultas é tratado como dado, nunca como instrução. O script `backend/scripts/avaliar_assistente.py` roda uma avaliação com 20 perguntas básicas e 11 avançadas, mais verificações determinísticas das camadas de defesa. O assistente fica desligado sem `GEMINI_API_KEY` ou com `IA_HABILITADO=false`.

---

## Solução de Problemas

| Sintoma | Causa provável e solução |
|---|---|
| `docker` não é reconhecido como comando | O Docker Desktop não foi instalado ou o PowerShell foi aberto antes da instalação: feche e abra o PowerShell |
| `error during connect` / `cannot find ... dockerDesktopLinuxEngine` | O Docker Desktop está fechado. Abra-o e espere *Engine running* |
| Docker Desktop pede para atualizar o WSL | Rode `wsl --update` no PowerShell como administrador e reinicie o computador |
| `env file ... .env not found` | Falta criar o `.env`: `Copy-Item .env.example .env` |
| `required variable ... is missing a value` | Variável obrigatória vazia no `.env` (`DB_NAME`, `DB_USER`, `DB_PASSWORD` ou `MYSQL_ROOT_PASSWORD`) |
| `port is already allocated` | Outro programa usa a porta (8080, 8000 ou 3307). Pare-o ou, para o MySQL, apague a linha `"3307:3306"` do compose |
| Backend reinicia sem parar | Veja `docker compose logs backend`. Causa comum: senha do `.env` com `$`, `%` ou aspas |
| Mudei a senha do banco no `.env` e deu erro de acesso | O MySQL só lê as senhas na **primeira** criação do volume. Recrie com `docker compose down -v` (apaga os dados) |
| `exec ... no such file or directory` ao iniciar | Fim de linha CRLF em script `.sh`. O `.gitattributes` do projeto força LF: refaça o checkout do arquivo |
| Tela abre mas diz que não conectou ao servidor | A API não está de pé em `http://<mesmo-endereço>:8000`. Confira `docker compose ps` |
| O uvicorn não recarrega no Windows (modo dev) | O `docker-compose.dev.yml` já força *polling*; confirme que usou os dois arquivos `-f` |
| Assistente de IA indisponível | Sem `GEMINI_API_KEY`, com `IA_HABILITADO=false` ou sem o usuário `IA_DB_USER` (veja o log do backend) |

---

## Roadmap

### Concluído

Backend completo com regras de negócio e controle de acesso por grupos; frontend redesenhado tela a tela (login, cadastros, pedidos, cotações, produção, formas de pagamento, financeiro, geladeiras, grupos de acesso, assistente de IA, usuários e dashboard); troca de senha pelo próprio usuário; tela de auditoria do assistente de IA; embalagem com fator de conversão nos produtos; assistente de IA com avaliação; empacotamento em Docker; diagrama ER atualizado e gerado a partir dos modelos.

### Evoluções futuras

Acesso via aplicativo móvel, monitoramento de temperatura das geladeiras por sensores IoT e restrição do CORS aos endereços do sistema.

---

## Sobre o Projeto

Este sistema foi desenvolvido como Trabalho de Conclusão de Curso (TCC) da [UniFAJ](https://unifaj.grupounieduk.com.br/), com o objetivo de aplicar em um caso real os conceitos estudados ao longo da graduação.

---

## Stack Utilizada

<div style="display: flex; flex-wrap: wrap; gap: 8px;">

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)

</div>
