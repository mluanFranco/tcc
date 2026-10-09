from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey, DateTime, Text, Numeric, UniqueConstraint
from decimal import Decimal
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

QTD = Numeric(12, 3)

# ─────────────────────────────────────────
#  USUÁRIO
# ─────────────────────────────────────────
class Usuario(Base):
    __tablename__ = "usuario"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    nome       = Column(String(100), nullable=False)
    email      = Column(String(100), nullable=False, unique=True)
    senha_hash = Column(String(255), nullable=False)
    ativo      = Column(Boolean, default=True)
    admin      = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ─────────────────────────────────────────
#  CATEGORIA
# ─────────────────────────────────────────
class Categoria(Base):
    __tablename__ = "categoria"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    nome       = Column(String(80), nullable=False, unique=True)
    ativo      = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    subcategorias = relationship("Subcategoria", back_populates="categoria")
    produtos      = relationship("Produto", back_populates="categoria")


# ─────────────────────────────────────────
#  SUBCATEGORIA
# ─────────────────────────────────────────
class Subcategoria(Base):
    __tablename__ = "subcategoria"
    __table_args__ = (
        UniqueConstraint("categoria_id", "nome", name="uq_subcategoria_categoria_nome"),
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    categoria_id = Column(Integer, ForeignKey("categoria.id"), nullable=False)
    nome         = Column(String(80), nullable=False)
    ativo        = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.now)
    updated_at   = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    categoria = relationship("Categoria", back_populates="subcategorias")
    produtos  = relationship("Produto", back_populates="subcategoria")


# ─────────────────────────────────────────
#  UNIDADE DE MEDIDA
# ─────────────────────────────────────────
class UnidadeMedida(Base):
    __tablename__ = "unidade_medida"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    nome       = Column(String(50), nullable=False)   # ex: "Quilograma"
    sigla      = Column(String(10), nullable=False, unique=True)  # ex: "kg"
    ativo      = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    produtos = relationship("Produto", back_populates="unidade_medida")


# ─────────────────────────────────────────
#  PRODUTO
# ─────────────────────────────────────────
class Produto(Base):
    __tablename__ = "produto"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    nome               = Column(String(100), nullable=False)
    descricao          = Column(String(255))

    categoria_id       = Column(Integer, ForeignKey("categoria.id"), nullable=False)
    subcategoria_id    = Column(Integer, ForeignKey("subcategoria.id"), nullable=False)
    unidade_medida_id  = Column(Integer, ForeignKey("unidade_medida.id"), nullable=False)

    e_insumo           = Column(Boolean, default=False, nullable=False)
    e_vendavel         = Column(Boolean, default=False, nullable=False)

    preco_custo        = Column(Float, nullable=False)
    porcentagem        = Column(Float, nullable=True)   # só relevante se e_vendavel=True
    preco_venda        = Column(Float, nullable=True)   # calculado e gravado pelo backend

    estoque_atual      = Column(QTD, default=Decimal("0"))
    estoque_reservado  = Column(QTD, default=Decimal("0"))
    estoque_minimo     = Column(QTD, default=Decimal("0"))

    ativo              = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=datetime.now)
    updated_at         = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    categoria       = relationship("Categoria", back_populates="produtos")
    subcategoria    = relationship("Subcategoria", back_populates="produtos")
    unidade_medida  = relationship("UnidadeMedida", back_populates="produtos")


# ─────────────────────────────────────────
#  CLIENTE
# ─────────────────────────────────────────
class Cliente(Base):
    __tablename__ = "cliente"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    nome        = Column(String(100), nullable=False)
    cpf_cnpj    = Column(String(20), nullable=False, unique=True)
    tipo        = Column(String(2))        # PF ou PJ (definido a partir do documento)
    telefone    = Column(String(20))
    email       = Column(String(100))
    ativo       = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.now)
    updated_at  = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    enderecos      = relationship("ClienteEndereco", back_populates="cliente", order_by="ClienteEndereco.id")
    geladeiras     = relationship("Geladeira", back_populates="cliente")
    pedidos_venda  = relationship("PedidoVenda", back_populates="cliente")


# ─────────────────────────────────────────
#  ENDEREÇO DO CLIENTE
# ─────────────────────────────────────────
class ClienteEndereco(Base):
    __tablename__ = "cliente_endereco"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id  = Column(Integer, ForeignKey("cliente.id"), nullable=False)
    tipo        = Column(String(10), nullable=False)   # principal | entrega
    # As colunas abaixo aceitam nulo no banco só para comportar endereços antigos
    # incompletos; a obrigatoriedade para novos cadastros é validada na API.
    cep         = Column(String(9))
    logradouro  = Column(String(150))
    numero      = Column(String(10))
    complemento = Column(String(100))
    bairro      = Column(String(80))
    cidade      = Column(String(80))
    uf          = Column(String(2))
    ddd         = Column(String(3))
    ativo       = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.now)
    updated_at  = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    cliente = relationship("Cliente", back_populates="enderecos")


# ─────────────────────────────────────────
#  FORNECEDOR
# ─────────────────────────────────────────
class Fornecedor(Base):
    __tablename__ = "fornecedor"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    nome        = Column(String(100), nullable=False)
    cnpj        = Column(String(20), nullable=False, unique=True)
    telefone    = Column(String(20))
    email       = Column(String(100))
    cep         = Column(String(9))
    logradouro  = Column(String(150))
    numero      = Column(String(10))
    complemento = Column(String(100))
    bairro      = Column(String(80))
    cidade      = Column(String(80))
    uf          = Column(String(2))
    ddd         = Column(String(3))
    ativo       = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.now)
    updated_at  = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    pedidos_compra = relationship("PedidoCompra", back_populates="fornecedor")
    cotacoes       = relationship("Cotacao", back_populates="fornecedor")


# ─────────────────────────────────────────
#  FORMA DE PAGAMENTO
# ─────────────────────────────────────────
class FormaPagamento(Base):
    __tablename__ = "forma_pagamento"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    descricao       = Column(String(100), nullable=False)
    tipo            = Column(String(20), nullable=False)  # vista | parcelado | prazo
    prazo_dias      = Column(Integer, default=0)
    taxa_percentual = Column(Float, default=0.0)
    ativo           = Column(Boolean, default=True)

    pedidos_compra = relationship("PedidoCompra", back_populates="forma_pagamento")


# ─────────────────────────────────────────
#  PEDIDO DE VENDA
# ─────────────────────────────────────────
class PedidoVenda(Base):
    __tablename__ = "pedido_venda"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id     = Column(Integer, ForeignKey("cliente.id"), nullable=False)
    usuario_id     = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    data_pedido    = Column(DateTime, default=datetime.now)
    valor_total    = Column(Float, default=0.0)
    status         = Column(String(20), default="aberto")  # aberto | confirmado | cancelado
    forma_pagamento = Column(String(30))
    observacao     = Column(String(255))
    created_at     = Column(DateTime, default=datetime.now)
    updated_at     = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    cliente = relationship("Cliente", back_populates="pedidos_venda")
    itens   = relationship("ItemPedidoVenda", back_populates="pedido_venda")


class ItemPedidoVenda(Base):
    __tablename__ = "item_pedido_venda"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    pedido_venda_id = Column(Integer, ForeignKey("pedido_venda.id"), nullable=False)
    produto_id      = Column(Integer, ForeignKey("produto.id"), nullable=False)
    quantidade      = Column(QTD, nullable=False)
    preco_unitario  = Column(Float, nullable=False)
    desconto        = Column(Float, default=0.0)
    subtotal        = Column(Float, nullable=False)

    pedido_venda = relationship("PedidoVenda", back_populates="itens")
    produto      = relationship("Produto")


# ─────────────────────────────────────────
#  PEDIDO DE COMPRA
# ─────────────────────────────────────────
class PedidoCompra(Base):
    __tablename__ = "pedido_compra"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    fornecedor_id        = Column(Integer, ForeignKey("fornecedor.id"), nullable=False)
    usuario_id           = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    forma_pagamento_id   = Column(Integer, ForeignKey("forma_pagamento.id"))
    data_pedido          = Column(DateTime, default=datetime.now)
    data_entrega_prevista = Column(DateTime)
    valor_total          = Column(Float, default=0.0)
    status               = Column(String(20), default="pendente")  # pendente | recebido | cancelado
    observacao           = Column(String(255))
    created_at           = Column(DateTime, default=datetime.now)
    updated_at           = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    fornecedor     = relationship("Fornecedor", back_populates="pedidos_compra")
    forma_pagamento = relationship("FormaPagamento", back_populates="pedidos_compra")
    itens          = relationship("ItemPedidoCompra", back_populates="pedido_compra")


class ItemPedidoCompra(Base):
    __tablename__ = "item_pedido_compra"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    pedido_compra_id    = Column(Integer, ForeignKey("pedido_compra.id"), nullable=False)
    produto_id          = Column(Integer, ForeignKey("produto.id"), nullable=False)
    quantidade          = Column(QTD, nullable=False)            # quantidade pedida
    quantidade_recebida = Column(QTD, default=Decimal("0"), nullable=False) # acumulado já recebido
    preco_unitario      = Column(Float, nullable=False)
    subtotal            = Column(Float, nullable=False)

    pedido_compra = relationship("PedidoCompra", back_populates="itens")
    produto       = relationship("Produto")


# ─────────────────────────────────────────
#  COTAÇÃO
# ─────────────────────────────────────────
class Cotacao(Base):
    __tablename__ = "cotacao"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    fornecedor_id = Column(Integer, ForeignKey("fornecedor.id"), nullable=False)
    usuario_id   = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    data_cotacao = Column(DateTime, default=datetime.now)
    status       = Column(String(20), default="rascunho")  # rascunho | enviada | recebida | aprovada
    observacao   = Column(String(255))
    created_at   = Column(DateTime, default=datetime.now)

    fornecedor = relationship("Fornecedor", back_populates="cotacoes")
    itens      = relationship("ItemCotacao", back_populates="cotacao")


class ItemCotacao(Base):
    __tablename__ = "item_cotacao"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    cotacao_id           = Column(Integer, ForeignKey("cotacao.id"), nullable=False)
    produto_id           = Column(Integer, ForeignKey("produto.id"), nullable=False)
    preco_unitario       = Column(Float)
    quantidade_referencia = Column(QTD, default=Decimal("1"))
    observacao           = Column(String(255))

    cotacao = relationship("Cotacao", back_populates="itens")
    produto = relationship("Produto")


# ─────────────────────────────────────────
#  GELADEIRA / MONITORAMENTO
# ─────────────────────────────────────────
class Geladeira(Base):
    __tablename__ = "geladeira"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    cliente_id    = Column(Integer, ForeignKey("cliente.id"), nullable=False)
    endereco_id   = Column(Integer, ForeignKey("cliente_endereco.id"), nullable=True)
    tipo          = Column(String(50), nullable=False)
    modelo        = Column(String(100))
    marca         = Column(String(50))
    numero_serie  = Column(String(100), unique=True)
    data_alocacao = Column(DateTime)
    status        = Column(String(20), default="em_campo")  # em_campo | manutencao | desativada

    cliente              = relationship("Cliente", back_populates="geladeiras")
    endereco             = relationship("ClienteEndereco")
    historico_manutencao = relationship("HistoricoManutencao", back_populates="geladeira")


class HistoricoManutencao(Base):
    __tablename__ = "historico_manutencao"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    geladeira_id = Column(Integer, ForeignKey("geladeira.id"), nullable=False)
    usuario_id   = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    data         = Column(DateTime, default=datetime.now)
    tipo         = Column(String(50), nullable=False)  # preventiva | corretiva
    descricao    = Column(Text)
    custo        = Column(Float, default=0.0)

    geladeira = relationship("Geladeira", back_populates="historico_manutencao")


# ─────────────────────────────────────────
#  RECEITA
# ─────────────────────────────────────────
class Receita(Base):
    __tablename__ = "receita"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    produto_id = Column(Integer, ForeignKey("produto.id"), nullable=False, unique=True)
    rendimento = Column(QTD, nullable=False)
    observacao = Column(String(255))
    ativo      = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    produto = relationship("Produto")
    itens   = relationship("ReceitaItem", back_populates="receita",
                           cascade="all, delete-orphan", order_by="ReceitaItem.id")


class ReceitaItem(Base):
    __tablename__ = "receita_item"
    __table_args__ = (UniqueConstraint("receita_id", "produto_id", name="uq_receita_item_receita_produto"),)
    id         = Column(Integer, primary_key=True, autoincrement=True)
    receita_id = Column(Integer, ForeignKey("receita.id", ondelete="CASCADE"), nullable=False)
    produto_id = Column(Integer, ForeignKey("produto.id"), nullable=False)
    quantidade = Column(QTD, nullable=False)
    receita = relationship("Receita", back_populates="itens")
    produto = relationship("Produto")