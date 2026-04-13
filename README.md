# Sistema de Gestão de Estoque e Monitoramento de Equipamentos

### Visão Geral

O sistema tem como objetivo entregar uma solução simples e eficiente para controle de estoque e monitoramento de equipamentos refrigerados (geladeiras e freezers) para a empresa [Nova Sorvetes](https://www.instagram.com/nova_sorvetes/), localizada em Itapira - SP. Com ele, a empresa poderá atender seus clientes com mais agilidade e manter maior controle sobre seus produtos e ativos.

![Logo Nova Sorvetes](/frontend/assets/images/logo-novasorvetes.png)

---

### Controle de Estoque

O fluxo de estoque é definido por pedidos de compra (entradas) e pedidos de venda (saídas). Para suportar essas operações, o sistema contempla também o cadastro de clientes, fornecedores e produtos — informações essenciais para a gestão completa dos pedidos realizados.

---

### Monitoramento de Equipamentos

As geladeiras e freezers utilizados no armazenamento dos produtos são alocados diretamente nos clientes, o que torna indispensável o acompanhamento contínuo desses ativos. O módulo de monitoramento permite que o responsável visualize a localização de cada equipamento e tome as providências necessárias diante de manutenções corretivas ou preventivas, garantindo tanto a qualidade do produto quanto a satisfação do cliente.

---

### Diagrama Entidade-Relacionamento

![Diagrama Entidade-Relacionamento](/frontend/assets/images/der.png)

Produto
- id (chave primária)
- descricao
- categoria
- unidade_medida
- preco_custo
- preco_venda
- estoque_atual (definido pelo fluxo)
- estoque_minimo
- created_at (data de cadastro)


Cliente
- id (chave primária)
- nome
- cpf_cpnj
- tipo (físico ou jurídico)
- telefone
- email
- endereco
- cidade
- estado
- created_at (data de cadastro)


Fornecedor
- id (chave primária)
- nome
- cnpj
- telefone
- email
- endereco
- cidade
- estado
- created_at (data de cadastro)


Pedido de Venda
- id (chave primária)
- cliente_id (chave estrangeira)
- data_pedido
- valor_total
- status (pendente, cancelado e finalizado)
- usuario_id (chave estrangeira)
- observacao


Pedido de Compra
- id (chave primária)
- fornecedor_id (chave estrangeira)
- data_pedido
- data_entrega_prevista
- valor_total
- status (pendente, cancelado e finalizado)
- usuario_id (chave estrangeira)
- observacao


Item Pedido Venda
- id (chave primária)
- pedido_venda_id (chave estrangeira)
- produto_id (chave estrangeira)
- quantidade
- preco_unitario
- desconto
- subtotal


Item Pedido Compra
- id (chave primária)
- pedido_compra_id (chave estrangeira)
- produto_id (chave estrangeira)
- quantidade
- preco_unitario
- subtotal

**Utilizamos tabelas intermediárias para os pedidos de venda e compra, pois os mesmos podem possuir mais de 1 produto atrelado.**

Usuario
- id (chave primária)
- nome
- email
- senha
- ativo
- admin
- created_at

Geladeira
- id (chave primária)
- tipo
- modelo
- marca
- cliente_id (chave estrangeira)
- data_alocacao
- endereco
- cidade
- estado

Historico Manutencao
- id (chave primária)
- geladeira_id (chave estrangeira)
- usuario_id (chave estrangeira)
- data
- tipo
- descricao

---

### Sobre o Projeto

Este sistema está sendo desenvolvido como Trabalho de Conclusão de Curso (TCC) da [UniFAJ](https://unifaj.grupounieduk.com.br/), com o objetivo de aplicar em um caso real os conceitos estudados ao longo da graduação.

**Stack utilizada:**

<div style="display: flex; flex-wrap: wrap; gap: 8px;">

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

</div>