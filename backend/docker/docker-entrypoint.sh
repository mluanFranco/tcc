#!/bin/sh
# Entrada do container do backend: espera o MySQL, aplica as migrations, prepara usuário da IA e admin inicial,
# e então sobe o comando do container (uvicorn). Tudo é idempotente: pode reiniciar à vontade.
set -e

echo "[entrada] Aguardando o banco de dados..."
python docker/preparar_banco.py esperar

echo "[entrada] Aplicando migrations (alembic upgrade head)..."
alembic upgrade head

echo "[entrada] Preparando usuário da IA e administrador inicial..."
python docker/preparar_banco.py preparar

echo "[entrada] Iniciando: $*"
exec "$@"
