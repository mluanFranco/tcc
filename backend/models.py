from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

# --- Usuário --- #

class Usuario(Base):
    __tablename__ = "usuario"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    nome = Column("nome", String(100), nullable=False)
    email = Column("email", String(100), nullable=False, unique=True)
    senha = Column("senha", String(255), nullable=False)
    ativo = Column("ativo", Boolean, default=True)
    admin = Column("admin", Boolean, default=False)
    created_at = Column("created_at", DateTime, default=datetime.now)

    def __init__(self, nome, email, senha, ativo=True, admin=False):
        self.nome = nome
        self.email = email
        self.senha = senha
        self.ativo = ativo
        self.admin = admin

# --- Cadastro --- #

class Produto(Base):
    __tablename__ = "produto"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    nome = Column("nome", String(100), nullable=False)
    descricao = Column("descricao", String(255))
    categoria = Column("categoria", String(50))
    unidade_medida = Column("unidade_medida", String(20))
    preco_custo = Column("preco_custo", Float, nullable=False)
    preco_venda = Column("preco_venda", Float) # Não adicionar nullable false, pois alguns produtos não são necessariamente vendidos.
    estoque_atual = Column("estoque_atual", Integer, default=0)
    estoque_minimo = Column("estoque_minimo", Integer, default=0)
    created_at = Column("created_at", DateTime, default=datetime.now)

    def __init__(self, nome, descricao=None, categoria=None, unidade_medida=None, preco_custo=None, preco_venda=None,  estoque_minimo=0):
        self.nome = nome
        self.descricao = descricao
        self.categoria = categoria
        self.unidade_medida = unidade_medida
        self.preco_custo = preco_custo
        self.preco_venda = preco_venda
        self.estoque_minimo = estoque_minimo


class Cliente(Base):
    __tablename__ = "cliente"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    nome = Column("nome", String(100), nullable=False)
    cpf_cnpj = Column("cpf_cnpj", String(20), nullable=False)
    tipo = Column("tipo", String(20))
    telefone = Column("telefone", String(20))
    email = Column("email", String(50))
    endereco = Column("endereco", String(100))
    cidade = Column("cidade", String(50))
    estado = Column("estado", String(20))
    created_at = Column("created_at", DateTime, default=datetime.now)

    def __init__(self, nome, cpf_cnpj, tipo=None, telefone=None, email=None, endereco=None, cidade=None, estado=None):
        self.nome = nome
        self.cpf_cnpj = cpf_cnpj
        self.tipo = tipo
        self.telefone = telefone
        self.email = email
        self.endereco = endereco
        self.cidade = cidade
        self.estado = estado


class Fornecedor(Base):
    __tablename__ = "fornecedor"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    nome = Column("nome", String(100), nullable=False)
    cnpj = Column("cnpj", String(20), nullable=False)
    telefone = Column("telefone", String(20))
    email = Column("email", String(50))
    endereco = Column("endereco", String(100))
    cidade = Column("cidade", String(50))
    estado = Column("estado", String(20))
    created_at = Column("created_at", DateTime, default=datetime.now)

    def __init__(self, nome, cnpj, telefone=None, email=None, endereco=None, cidade=None, estado=None):
        self.nome = nome
        self.cnpj = cnpj
        self.telefone = telefone
        self.email = email
        self.endereco = endereco
        self.cidade = cidade
        self.estado = estado


# --- Pedido de Venda --- #

class PedidoVenda(Base):
    __tablename__ = "pedido_venda"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    cliente_id = Column("cliente_id", Integer, ForeignKey("cliente.id"))
    data_pedido = Column("data_pedido", DateTime)
    valor_total = Column("valor_total", Float, nullable=False)
    status = Column("status", String(20))
    usuario_id = Column("usuario_id", ForeignKey("usuario.id"))
    observacao = Column("observacao", String(255), default=None)

    def __init__(self, cliente_id, data_pedido, valor_total=0, status=None, usuario_id=None, observacao=None):
        self.cliente_id = cliente_id
        self.data_pedido = data_pedido
        self.valor_total = valor_total
        self.status = status
        self.usuario_id = usuario_id
        self.observacao = observacao


class ItemPedidoVenda(Base):
    __tablename__ = "item_pedido_venda"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    pedido_venda_id = Column("pedido_venda_id", ForeignKey("pedido_venda.id"))
    produto_id = Column("produto_id", ForeignKey("produto.id"))
    quantidade = Column("quantidade", Integer, nullable=False)
    preco_unitario = Column("preco_unitario", Float, default=0)
    desconto = Column("desconto", Float, default=0)
    subtotal = Column("subtotal", Float)

    def __init__(self, pedido_venda_id, produto_id, quantidade=0, preco_unitario=0, desconto=0, subtotal=0):
        self.pedido_venda_id = pedido_venda_id
        self.produto_id = produto_id
        self.quantidade = quantidade
        self.preco_unitario = preco_unitario
        self.desconto = desconto
        self.subtotal = subtotal


# --- Pedido de Compra --- #

class PedidoCompra(Base):
    __tablename__ = "pedido_compra"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    fornecedor_id = Column("fornecedor_id", Integer, ForeignKey("fornecedor.id"))
    data_pedido = Column("data_pedido", DateTime)
    data_entrega_prevista = Column("data_entrega_prevista", DateTime)
    valor_total = Column("valor_total", Float, nullable=False)
    status = Column("status", String(20))
    usuario_id = Column("usuario_id", ForeignKey("usuario.id"))
    observacao = Column("observacao", String(255), default=None)

    def __init__(self, fornecedor_id, data_pedido, data_entrega_prevista, valor_total=0, status=None, usuario_id=None, observacao=None):
        self.fornecedor_id = fornecedor_id
        self.data_pedido = data_pedido
        self.data_entrega_prevista = data_entrega_prevista
        self.valor_total = valor_total
        self.status = status
        self.usuario_id = usuario_id
        self.observacao = observacao


class ItemPedidoCompra(Base):
    __tablename__ = "item_pedido_compra"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    pedido_compra_id = Column("pedido_compra_id", ForeignKey("pedido_compra.id"))
    produto_id = Column("produto_id", ForeignKey("produto.id"))
    quantidade = Column("quantidade", Integer, nullable=False)
    preco_unitario = Column("preco_unitario", Float, default=0)
    subtotal = Column("subtotal", Float)

    def __init__(self, pedido_compra_id, produto_id, quantidade=0, preco_unitario=0, subtotal=0):
        self.pedido_compra_id = pedido_compra_id
        self.produto_id = produto_id
        self.quantidade = quantidade
        self.preco_unitario = preco_unitario
        self.subtotal = subtotal


# --- Monitoramento de Equipamentos --- #

class Geladeira(Base):
    __tablename__ = "geladeira"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    tipo = Column("tipo", String(50), nullable=False)
    modelo = Column("modelo", String(100))
    marca = Column("marca", String(50))
    cliente_id = Column("cliente_id", ForeignKey("cliente.id"))
    data_alocacao = Column("data_alocacao", DateTime)
    endereco = Column("endereco", String(100))
    cidade = Column("cidade", String(50))
    estado = Column("estado", String(20))

    def __init__(self, tipo=None, modelo=None, marca=None, cliente_id=None, data_alocacao=None, endereco=None, cidade=None, estado=None):
        self.tipo = tipo
        self.modelo = modelo
        self.marca = marca
        self.cliente_id = cliente_id
        self.data_alocacao = data_alocacao
        self.endereco = endereco
        self.cidade = cidade
        self.estado = estado


class HistoricoManutencao(Base):
    __tablename__ = "historico_manutencao"

    id = Column("id", Integer, primary_key=True, autoincrement=True, nullable=False)
    geladeira_id = Column("geladeira_id", ForeignKey("geladeira.id"))
    usuario_id = Column("usuario_id", ForeignKey("usuario.id"))
    data = Column("data", DateTime)
    tipo = Column("tipo", String(50))
    descricao = Column("descricao", String(255))

    def __init__(self, geladeira_id, usuario_id, data, tipo, descricao):
        self.geladeira_id = geladeira_id
        self.usuario_id = usuario_id
        self.data = data
        self.tipo = tipo
        self.descricao = descricao