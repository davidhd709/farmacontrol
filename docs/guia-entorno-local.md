# Guía de Puesta en Marcha del Entorno Local

**Sistema:** Sistema de Gestión para Farmacia  
**Fase:** Fase 0 — Cimientos Técnicos (Slice 001.1)  

---

## 1. Requisitos Previos

- **Node.js:** Versión 22+ (o 24 LTS recomendada por arquitectura)
- **pnpm:** Versión 12+ (disponible vía corepack o npx)
- **Docker & Docker Compose:** Versión moderna con soporte de Compose v2

---

## 2. Variables de Entorno

Copie el archivo de plantilla a `.env`:

```bash
cp .env.example .env
```

Por defecto, la base de datos PostgreSQL se expone en el puerto **5434** en el host para evitar colisiones con otras instancias locales en el puerto estándar 5432.

---

## 3. Instalación de Dependencias

Instale todas las dependencias del monorepositorio con `pnpm`:

```bash
pnpm install
```

---

## 4. Base de Datos Local (Docker Compose)

Levante el contenedor de PostgreSQL 18:

```bash
# Iniciar contenedor en segundo plano
pnpm db:up

# Verificar estado y healthcheck
pnpm db:status

# Detener contenedor cuando sea necesario
pnpm db:down
```

> **Nota sobre la arquitectura de Docker Compose:**
> - `infra/compose/docker-compose.yml` es la **definición canónica** de los servicios de infraestructura.
> - El archivo `docker-compose.yml` ubicado en la raíz del repositorio actúa exclusivamente como un **punto de entrada de conveniencia** mediante la directiva `include`.
> - Cualquier nuevo servicio, variable o volumen debe definirse o modificarse siempre dentro de `infra/compose/`.

---

## 5. Gestión de Base de Datos y Prisma ORM

La persistencia se centraliza en el paquete `@farmacia/database` (`packages/database`), reutilizable por `apps/api` y `apps/worker`:

```bash
# Validar el esquema de Prisma (sin modelos en esta fase de cimientos)
pnpm db:validate

# Generar el cliente de Prisma Client tipado
pnpm db:generate

# Comprobar la conexión real contra PostgreSQL 18 en desarrollo (farmacia_db)
pnpm db:check

# Crear la base de datos de pruebas si no existe
pnpm db:test:create

# Comprobar la conexión real contra la base de datos de pruebas (farmacia_test)
pnpm db:test:check
```

### Aislamiento estricto de bases de datos:
- **`DATABASE_URL` (Desarrollo):** Conecta a `farmacia_db`. Es la base utilizada por la API, worker y comandos estándar.
- **`DATABASE_TEST_URL` (Pruebas Automatizadas):** Conecta exclusivamente a `farmacia_test`. Las suites de testing (`pnpm test`) rechazan el uso de `DATABASE_URL` y exigen `DATABASE_TEST_URL`.
- **Protección defensiva:** El cliente de base de datos valida que la URL de pruebas apunte únicamente a bases cuyo nombre sea `farmacia_test` o termine en `_test`. Si se configura accidentalmente `farmacia_db` como base de pruebas, la ejecución se aborta de inmediato antes de realizar cualquier operación.

---

## 6. Pruebas Automatizadas y Calidad

El monorepositorio utiliza **Vitest** como test runner unificado con ejecución transversal de pruebas reales aisladas:

```bash
# Ejecutar todas las pruebas del monorepositorio (contra farmacia_test)
pnpm test

# Ejecutar pruebas en modo observador (watch)
pnpm test:watch

# Ejecutar validaciones estáticas y compilación
pnpm build
pnpm lint
pnpm typecheck
```

### Pruebas reales implementadas actualmente:
1. **`@farmacia/api` (`apps/api/test/health.e2e-spec.ts`):**
   - Prueba de integración HTTP con **Supertest** y NestJS real compilado en memoria.
   - Valida el endpoint `GET /api/v1/health`, su código HTTP 200 y estructura (`status`, `timestamp`, `uptime`).
2. **`@farmacia/database` (`packages/database/test/connection.integration.spec.ts`):**
   - Prueba de integración con PostgreSQL real en la base aislada **`farmacia_test`**.
   - Valida que `current_database()` sea estrictamente `farmacia_test`.
   - Pruebas unitarias de seguridad que verifican el rechazo de `farmacia_db` y bases no autorizadas para testing.

### Validación completa del entorno local:
```bash
pnpm install
pnpm db:validate
pnpm db:generate
pnpm db:check
pnpm db:test:check
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```



---

## 7. Estructura de Paquetes

- `apps/api`: Backend NestJS (API REST en `/api/v1`)
- `apps/web`: Frontend React 19 + Vite
- `apps/worker`: Servicio de tareas asíncronas y cron en segundo plano (NestJS)
- `packages/contracts`: Contratos, tipos e interfaces compartidas
- `packages/database`: Capa canónica de base de datos con Prisma ORM y cliente tipado
- `infra/compose`: Definiciones de infraestructura local con Docker Compose

