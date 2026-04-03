# Sistema de Gestão de Estoque e Monitoramento de Equipamentos

### Visão Geral

O sistema tem como principal objetivo entregar uma solução simples e eficiente de controle de estoque, insumos e monitoramento de equipamentos (geladeiras e freezer), para a empresa [Nova Sorvetes](https://www.instagram.com/nova_sorvetes/), localizada em Itapira - SP.

### DER (Diagrama Entidade Relacionamento)

Criação do design de banco de dados, definição de tabelas, PK's, FK's e relacionamentos.

![alt text](/frontend/assets/images/der.png)

A gestão de estoque irá contar com a presença de 7 tabelas:

- Produto
- Cliente
- Fornecedor
- Pedido de Venda
- Pedido de Compra
- Item Pedido Venda
- Item Pedido Compra

As tabelas **Produto**, **Cliente** e **Forncedor** irão conter informações simples de cadastro, para que seja possível criar **Pedido de Compra** e **Pedido de Venda**, responsáveis pelo fluxo de entrada e saída do estoque.

Pedidos de compra e venda irão possuir tabelas intermediárias, responsáveis por armazenar os itens / produtos atrelados ao pedido, levando em conta que um pedido pode possuir 1 ou mais itens (1 - *). Isso garante que a existência de vários itens presentes em 1 pedido não duplique o cabeçalho.