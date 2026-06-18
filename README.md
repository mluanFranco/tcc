# Sistema de Gestão de Estoque e Monitoramento de Equipamentos

Sistema de gestão de estoque desenvolvido para a empresa [Nova Sorvetes](https://www.instagram.com/nova_sorvetes/), localizada em Itapira – SP, com o objetivo de substituir o controle manual por planilhas por uma solução informatizada, centralizada e rastreável.

![Logo Nova Sorvetes](/frontend/assets/images/logo-novasorvetes.png)

---

## Sumário

- [Sistema de Gestão de Estoque e Monitoramento de Equipamentos](#sistema-de-gestão-de-estoque-e-monitoramento-de-equipamentos)
  - [Sumário](#sumário)
  - [Visão Geral](#visão-geral)
  - [Módulos do Sistema](#módulos-do-sistema)
  - [Modelo de Dados](#modelo-de-dados)
    - [Produto](#produto)
    - [Cliente / Fornecedor](#cliente--fornecedor)
    - [Pedido de Venda / Pedido de Compra](#pedido-de-venda--pedido-de-compra)
    - [Item Pedido Venda / Item Pedido Compra](#item-pedido-venda--item-pedido-compra)
    - [Cotação / Item Cotação](#cotação--item-cotação)
    - [Forma de Pagamento](#forma-de-pagamento)
    - [Usuário](#usuário)
    - [Geladeira / Histórico de Manutenção](#geladeira--histórico-de-manutenção)
  - [Arquitetura](#arquitetura)
  - [Estrutura de Pastas](#estrutura-de-pastas)
  - [Como Executar o Projeto](#como-executar-o-projeto)
  - [Sobre o Projeto](#sobre-o-projeto)
  - [Stack Utilizada](#stack-utilizada)

---

## Visão Geral

O sistema entrega uma solução simples e funcional para o controle de estoque e o monitoramento de equipamentos refrigerados (geladeiras e freezers) alocados nos clientes da empresa. Com ele, é possível:

- Controlar entradas e saídas de produtos via pedidos de compra e venda;
- Cadastrar clientes e fornecedores com preenchimento automático de endereço via CEP;
- Comparar cotações entre fornecedores para identificar o melhor custo-benefício;
- Registrar formas de pagamento e prazos associados às compras;
- Acompanhar os equipamentos alocados em cada cliente e seu histórico de manutenção.

---

## Módulos do Sistema

| Módulo | Responsabilidade |
|---|---|
| **Controle de Estoque** | Cadastro de produtos, clientes e fornecedores; registro de pedidos de compra e venda; atualização automática do saldo em estoque |
| **Cotação de Produtos** | Registro de cotações recebidas de fornecedores e comparação de preços por produto |
| **Formas de Pagamento** | Cadastro das modalidades de pagamento (à vista, parcelado, a prazo) associadas aos pedidos de compra |
| **Monitoramento de Equipamentos** | Cadastro de geladeiras/freezers alocados a clientes e registro do histórico de manutenções realizadas |

---

## Modelo de Dados

O modelo relacional foi estruturado a partir de um Diagrama Entidade-Relacionamento (DER), contemplando as seguintes entidades:

![Diagrama Entidade-Relacionamento](/frontend/assets/images/der.png)

### Produto
Controla os itens comercializados e seus respectivos níveis de estoque.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `nome`, `descricao`, `categoria`, `unidade_medida` | Identificação e categorização |
| `preco_custo`, `preco_venda` | Precificação |
| `estoque_atual` | Atualizado automaticamente pelo fluxo de pedidos |
| `estoque_minimo` | Utilizado para alertas de reposição |
| `ativo` | Soft delete |
| `created_at`, `updated_at` | Auditoria |

### Cliente / Fornecedor
Armazenam os dados cadastrais e de endereço, preenchidos automaticamente via integração com a [API ViaCEP](https://viacep.com.br/).
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `nome`, `cpf_cnpj` (ou `cnpj`), `tipo`, `telefone`, `email` | Dados cadastrais |
| `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `ddd` | Endereço, preenchido via ViaCEP |
| `ativo` | Soft delete |
| `created_at`, `updated_at` | Auditoria |

### Pedido de Venda / Pedido de Compra
Representam, respectivamente, a saída e a entrada de produtos no estoque.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `cliente_id` / `fornecedor_id` | Chave estrangeira |
| `usuario_id` | Responsável pelo registro |
| `data_pedido`, `data_entrega_prevista`* | Controle de datas (*apenas compra) |
| `valor_total`, `status`, `observacao` | Dados da transação |
| `forma_pagamento_id`* | Apenas pedido de compra |

### Item Pedido Venda / Item Pedido Compra
Tabelas intermediárias que viabilizam a relação um-para-muitos entre pedidos e produtos, permitindo múltiplos itens por pedido.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `pedido_venda_id` / `pedido_compra_id` | Chave estrangeira |
| `produto_id` | Chave estrangeira |
| `quantidade`, `preco_unitario`, `subtotal` | Dados do item |
| `desconto`* | Apenas item de venda |

### Cotação / Item Cotação
Permitem registrar e comparar preços oferecidos por diferentes fornecedores para um mesmo produto.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `fornecedor_id`, `usuario_id` | Chaves estrangeiras |
| `data_cotacao`, `status`, `observacao` | Dados da cotação |
| `produto_id`, `preco_unitario`, `quantidade_referencia` | Itens cotados |

### Forma de Pagamento
Tabela de referência para as modalidades de pagamento usadas nos pedidos de compra.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `descricao`, `tipo` | À vista, parcelado ou a prazo |
| `prazo_dias`, `taxa_percentual` | Condições da modalidade |

### Usuário
Controla o acesso ao sistema e a rastreabilidade das operações.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `nome`, `email`, `senha_hash` | Autenticação (senha armazenada com hash bcrypt) |
| `ativo`, `admin` | Controle de acesso e nível de permissão |
| `created_at`, `updated_at` | Auditoria |

### Geladeira / Histórico de Manutenção
Compõem o módulo de monitoramento de equipamentos. O endereço da geladeira não é replicado — é sempre obtido a partir do cliente ao qual está alocada (`cliente_id`), evitando duplicidade e inconsistência de dados.
| Campo | Descrição |
|---|---|
| `id` | Chave primária |
| `cliente_id` | Chave estrangeira — define a localização do equipamento |
| `tipo`, `modelo`, `marca`, `numero_serie`, `status` | Identificação do equipamento |
| `geladeira_id`, `usuario_id`, `data`, `tipo`, `descricao`, `custo` | Registro de manutenções (tabela `historico_manutencao`) |

> **Por que tabelas intermediárias?** Pedidos de compra e venda podem conter múltiplos produtos. Em vez de repetir colunas no cabeçalho do pedido, cada item é armazenado em sua própria linha, vinculado ao pedido e ao produto correspondente — garantindo normalização e evitando redundância de dados.

---

## Arquitetura

O sistema segue uma arquitetura em camadas, com separação clara de responsabilidades:

```
Frontend (HTML/CSS/JS)
        │
        ▼
Backend (FastAPI)
   ├── routes/    → Endpoints REST
   ├── schemas/   → Validação de entrada/saída (Pydantic)
   ├── core/      → Autenticação e segurança (JWT)
   └── models.py  → Mapeamento ORM (SQLAlchemy)
        │
        ▼
Banco de Dados (MySQL)
```

A comunicação entre frontend e backend ocorre via requisições HTTP/JSON consumindo a API REST exposta pelo FastAPI. A autenticação é feita por token JWT (Bearer), com diferenciação entre usuários comuns e administradores.

---

## Estrutura de Pastas

```
sist_gest_est_mon/
├── backend/
│   ├── core/
│   │   └── security.py       # Autenticação JWT e dependências de permissão
│   ├── routes/                # Endpoints da API, um arquivo por entidade
│   ├── schemas/                # Modelos Pydantic de entrada/saída
│   ├── database.py             # Configuração de conexão com o MySQL
│   ├── models.py                # Modelos ORM (SQLAlchemy)
│   ├── create_tables.py         # Script de criação das tabelas
│   ├── main.py                   # Inicialização da aplicação FastAPI
│   └── requirements.txt           # Dependências do projeto
├── frontend/                       # Interface web (HTML, CSS, JS)
├── .gitignore
└── README.md
```

---

## Como Executar o Projeto

**Pré-requisitos:** Python 3.12+, MySQL Server, Git

```bash
# 1. Clonar o repositório
git clone <url-do-repositorio>
cd sist_gest_est_mon/backend

# 2. Criar e ativar o ambiente virtual
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# 3. Instalar as dependências
pip install -r requirements.txt

# 4. Configurar variáveis de ambiente
# Crie um arquivo .env na pasta backend/ com:
#   DB_USER=root
#   DB_PASSWORD=sua_senha
#   DB_HOST=localhost
#   DB_PORT=3306
#   DB_NAME=sist_gest_est_mon
#   SECRET_KEY=sua_chave_secreta
#   ALGORITHM=HS256
#   ACCESS_TOKEN_EXPIRE_HOURS=8

# 5. Criar o banco de dados no MySQL
# CREATE DATABASE sist_gest_est_mon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 6. Criar as tabelas
python create_tables.py

# 7. Subir o servidor
uvicorn main:app --reload
```

A documentação interativa da API estará disponível em `http://127.0.0.1:8000/docs`.

---

## Sobre o Projeto

Este sistema está sendo desenvolvido como Trabalho de Conclusão de Curso (TCC) da [UniFAJ](https://unifaj.grupounieduk.com.br/), com o objetivo de aplicar em um caso real os conceitos estudados ao longo da graduação.

---

## Stack Utilizada

<div style="display: flex; flex-wrap: wrap; gap: 8px;">

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

</div>