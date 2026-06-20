from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


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
#  PRODUTO
# ─────────────────────────────────────────
class Produto(Base):
    __tablename__ = "produto"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    nome           = Column(String(100), nullable=False)
    descricao      = Column(String(255))
    categoria      = Column(String(50))
    unidade_medida = Column(String(20))
    preco_custo    = Column(Float, nullable=False)
    preco_venda    = Column(Float)
    estoque_atual  = Column(Integer, default=0)
    estoque_minimo = Column(Integer, default=0)
    estoque_reservado = Column(Integer, default=0)
    ativo          = Column(Boolean, default=True)
    created_at     = Column(DateTime, default=datetime.now)
    updated_at     = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# ─────────────────────────────────────────
#  CLIENTE
# ─────────────────────────────────────────
class Cliente(Base):
    __tablename__ = "cliente"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    nome        = Column(String(100), nullable=False)
    cpf_cnpj    = Column(String(20), nullable=False, unique=True)
    tipo        = Column(String(2))        # PF ou PJ
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

    geladeiras     = relationship("Geladeira", back_populates="cliente")
    pedidos_venda  = relationship("PedidoVenda", back_populates="cliente")


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
    status         = Column(String(20), default="aberto")  # aberto | concluido | cancelado
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
    quantidade      = Column(Integer, nullable=False)
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
    quantidade          = Column(Integer, nullable=False)            # quantidade pedida
    quantidade_recebida = Column(Integer, default=0, nullable=False) # acumulado já recebido
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
    quantidade_referencia = Column(Integer, default=1)
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
    tipo          = Column(String(50), nullable=False)
    modelo        = Column(String(100))
    marca         = Column(String(50))
    numero_serie  = Column(String(100), unique=True)
    data_alocacao = Column(DateTime)
    status        = Column(String(20), default="em_campo")  # em_campo | manutencao | desativada

    cliente              = relationship("Cliente", back_populates="geladeiras")
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