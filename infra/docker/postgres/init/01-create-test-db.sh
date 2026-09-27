#!/bin/bash
set -e

# Crea la base de datos de pruebas si no existe para garantizar aislamiento local
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE farmacia_test'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'farmacia_test')\gexec
EOSQL
