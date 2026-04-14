from database import engine, Base
import models # Importa o arquivo models e garante que todas as classes sejam registradas no Base

Base.metadata.create_all(bind=engine)
print("Tabelas criadas com sucesso")