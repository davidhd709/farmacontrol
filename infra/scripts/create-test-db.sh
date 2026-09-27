#!/usr/bin/env bash
set -e

CONTAINER_NAME="farmacia-postgres-dev"
DB_USER="${DB_USER:-farmacia_user}"
DB_TEST_NAME="${DB_TEST_NAME:-farmacia_test}"

echo "[db:test:create] Verificando base de datos '${DB_TEST_NAME}' en contenedor '${CONTAINER_NAME}'..."

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[db:test:create] ❌ El contenedor ${CONTAINER_NAME} no está en ejecución. Ejecute primero 'pnpm db:up'."
  exit 1
fi

EXISTS=$(docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_TEST_NAME}';" | tr -d '[:space:]')

if [ "$EXISTS" = "1" ]; then
  echo "[db:test:create] ✅ La base de datos '${DB_TEST_NAME}' ya existe."
else
  docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_TEST_NAME};"
  echo "[db:test:create] ✅ Base de datos '${DB_TEST_NAME}' creada exitosamente."
fi
