from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

# --- Cadastro --- #

class Produto(Base):
    __tablename__ = "produto"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    nome = Column(String(100), nullable=False)
    descricao = Column(String(255))
    categoria = Column(String(50))
    unidade_medida = Column(String(20))
    preco_custo = Column(Float, nullable=False)
    preco_venda = Column(Float) # Não adicionar nullable false, pois alguns produtos não são necessariamente vendidos.
    estoque_atual = Column(Integer, default=0)
    estoque_minimo = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)

    def __init__(self, nome, descricao=None, categoria=None, unidade_medida=None, preco_custo=None, preco_venda=None,  estoque_minimo=0):
        self.nome = nome
        self.descricao = descricao
        self.categoria = categoria
        self.unidade_medida = unidade_medida
        self.preco_custo = preco_custo
        self.preco_venda = preco_venda