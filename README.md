# FarmaControl — Sistema de Gestión Operativa para Farmacia

**FarmaControl** es un sistema web integral de alta disponibilidad y trazabilidad farmacéutica para la gestión de punto de venta (POS), catálogo de medicamentos y productos de consumo, control estricto de inventario por lotes y vencimientos (**regla regulatoria FEFO**), compras, proveedores, clientes, cuentas por cobrar/pagar, arqueo de caja, procesos en segundo plano, reportes operativos con exportación tabular y copias de seguridad automatizadas con verificación criptográfica SHA-256.

---

## 1. Arquitectura y Stack Tecnológico

El proyecto está estructurado como un **Monolito Modular** en un monorepositorio gestionado con **pnpm workspaces**:

```text
├── apps/
│   ├── api/          # Backend NestJS (REST API /api/v1, OpenAPI, RBAC, auditoría inmutable)
│   ├── web/          # Frontend React 19 + Vite + Material UI v6 + React Query + Hook Form
│   └── worker/       # Motor de tareas en segundo plano (@nestjs/schedule, evaluación de alertas)
├── packages/
│   ├── contracts/    # DTOs compartidos, contratos de interfaz, enums y permisos RBAC
│   └── database/     # Prisma ORM, migraciones PostgreSQL y seeds de seguridad
├── infra/
│   ├── compose/      # Orquestación con Docker Compose
│   ├── docker/       # Definiciones de contenedores y servicios
│   ├── scripts/      # Scripts de backup lógico (pg_dump -Fc), verificación y restauración
│   └── backups/      # Almacenamiento local de volcados con hash SHA-256 y metadatos JSON
└── docs/             # Requerimientos, arquitectura, diseño UX/UI, plan de desarrollo y runbooks
```

### Tecnologías Principales

- **Lenguaje:** TypeScript 5.8+ (end-to-end con tipado estricto)
- **Backend:** NestJS 11, Node.js 22, Prisma ORM 6
- **Base de Datos:** PostgreSQL 18
- **Frontend:** React 19, Vite 6, Material UI (MUI), TanStack React Query 5, Zod, React Router 7
- **Infraestructura:** Docker, Docker Compose, Scripts Bash con `set -euo pipefail`
- **Seguridad:** Argon2id para contraseñas, sesiones basadas en cookies seguras HTTP-Only, RBAC con permisos atómicos, interceptor de `correlationId` y logs inmutables de auditoría en PostgreSQL.

---

## 2. Cobertura de Épicas y Funcionalidades

| Épica | Historia | Alcance y Capacidades Clave | Estado |
|---|---|---|:---:|
| **ÉPICA 01** | `HU-001` a `HU-004` | Infraestructura PostgreSQL, Autenticación Argon2id, Sesiones HTTP-Only, Control de Acceso RBAC (Roles y Permisos) y Registro Inmutable de Auditoría (`audit_events`). | ✅ IMPLEMENTADO |
| **ÉPICA 02** | `HU-005` a `HU-008` | Catálogo: Categorías, Productos y Presentaciones Comerciales con factor de conversión a unidad base, precios de costo y venta. | ✅ IMPLEMENTADO |
| **ÉPICA 03** | `HU-009` a `HU-011` | Inventario por Lotes, Trazabilidad Histórica de Movimientos (`inventory_movements`), Ajustes de Stock Autorizados y Ubicaciones Físicas. | ✅ IMPLEMENTADO |
| **ÉPICA 04** | `HU-012` a `HU-013` | Gestión Integral de Proveedores y Recepción de Compras con registro de factura, cálculo de costos y creación transaccional de lotes. | ✅ IMPLEMENTADO |
| **ÉPICA 05** | `HU-014` y `HU-016` | Punto de Venta (POS - `UX-10`): Facturación rápida, lector de códigos, **asignación FEFO obligatoria**, protección contra saldo negativo y anulación con reversión. | ✅ IMPLEMENTADO |
| **ÉPICA 06** | `HU-017` a `HU-020` | Directorio de Clientes, Control de Caja (ingresos, egresos y saldo neto) y Gestión de Cartera (Cuentas por Cobrar y Cuentas por Pagar con abonos parciales). | ✅ IMPLEMENTADO |
| **ÉPICA 07** | `HU-021` | Módulo Frontend de Cartera: Interfaces `UX-21` (Cuentas por Cobrar) y `UX-23` (Cuentas por Pagar) con modales de pago y KPIs financieros. | ✅ IMPLEMENTADO |
| **ÉPICA 08** | `HU-022` | Worker en Segundo Plano (`apps/worker`): Escaneo periódico programado de lotes, clasificación de vencimientos (Vencido, Crítico, Alerta, Próximo) y pantalla `UX-14`. | ✅ IMPLEMENTADO |
| **ÉPICA 09** | `HU-023` | Reportes Operativos (`UX-27`): Inventario valorizado al costo y venta, lotes por vencer, ventas por período con medios de pago, caja y **exportación a CSV con UTF-8 BOM para Excel**. | ✅ IMPLEMENTADO |
| **ÉPICA 10** | `HU-024` | Resiliencia y Copias de Seguridad: Scripts `backup.sh`, `restore.sh`, `verify-backup.sh`, Runbook de Recuperación ante Desastres (`docs/runbooks/backup-restore.md`) y Gestión en Frontend (`UX-31`). | ✅ IMPLEMENTADO |

---

## 3. Requisitos Previos

- **Node.js:** Versión 22 o superior
- **pnpm:** Versión 10 o superior (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker y Docker Compose:** Para servicios de infraestructura
- **PostgreSQL Client (opcional en host):** `pg_dump`, `psql`, `pg_restore` (incluidos en las imágenes Docker)

---

## 4. Puesta en Marcha en Entorno Local

### 4.1 Clonar e Instalar Dependencias

```bash
git clone <URL_REPOSITORIO>
cd Farmacia
pnpm install
```

### 4.2 Levantar la Base de Datos

```bash
pnpm db:up
```

### 4.3 Configuración de Variables de Entorno

Copiar los archivos de ejemplo en los paquetes correspondientes:

```bash
cp .env.example .env
```

### 4.4 Aplicar Migraciones y Seed Inicial de Seguridad

```bash
# Aplicar migraciones de base de datos
pnpm --filter @farmacia/database exec prisma migrate deploy

# Poblar roles y permisos RBAC
pnpm db:seed:rbac
```

El seed de RBAC no crea usuarios ni contraseñas por defecto. Para crear el primer
administrador en una base de datos sin usuarios, define un nombre de usuario y
una contraseña propia, y ejecuta:

```bash
export INITIAL_ADMIN_USERNAME=admin_farmacia
read -rs INITIAL_ADMIN_PASSWORD
export INITIAL_ADMIN_PASSWORD
pnpm db:seed:admin
unset INITIAL_ADMIN_PASSWORD
```

La contraseña debe tener entre 10 y 128 caracteres e incluir mayúscula,
minúscula, número y carácter especial. El comando rechaza el aprovisionamiento
si ya existe algún usuario; en ese caso se deben usar las credenciales de un
usuario existente. Tras varios intentos fallidos, el inicio de sesión se bloquea
temporalmente y la API indica el tiempo de espera en `Retry-After`.

Si olvidaste la contraseña de una cuenta `admin` ya creada, restablécela desde
una terminal en el servidor que tiene acceso a la base de datos. Detén antes
la API y espera a que terminen las peticiones en curso; vuelve a iniciarla
después del comando:

```bash
export RESET_ADMIN_USERNAME=admin_farmacia
read -rs RESET_ADMIN_PASSWORD
export RESET_ADMIN_PASSWORD
pnpm db:reset:admin-password
unset RESET_ADMIN_PASSWORD
unset RESET_ADMIN_USERNAME
```

El comando usa `admin` si no defines `RESET_ADMIN_USERNAME`. Exige que la cuenta
indicada esté activa y tenga el rol de administrador,
registra el cambio en auditoría y revoca sus sesiones anteriores. No incluyas
la contraseña en el comando ni la compartas por chat.

### 4.5 Iniciar Servicios en Modo Desarrollo

El monorepositorio no tiene un comando único de desarrollo; cada servicio se
inicia en su propia terminal:

```bash
# Paquetes compartidos (una vez, y cada vez que cambien)
pnpm db:generate
pnpm --filter @farmacia/contracts build
pnpm --filter @farmacia/database build

# Terminal 1: API
pnpm --filter @farmacia/api start:dev

# Terminal 2: frontend
pnpm --filter @farmacia/web dev

# Terminal 3: worker (alertas de vencimiento y tareas en segundo plano)
pnpm --filter @farmacia/worker start:dev
```

Puertos asignados:
- **Frontend Web:** [http://localhost:5173](http://localhost:5173)
- **API Backend:** [http://localhost:3000/api/v1](http://localhost:3000/api/v1)
- **PostgreSQL:** `localhost:5434` (mapeado a `5432` en el contenedor)

La API todavía no publica documentación OpenAPI / Swagger.

---

## 5. Pruebas y Aseguramiento de Calidad

El proyecto cuenta con una batería de pruebas automatizadas que validan lógica de dominio, transacciones concurrentes en base de datos real y experiencia de usuario:

```bash
# Ejecutar todas las pruebas del monorepositorio (api, web, worker y database)
# contra un PostgreSQL temporal creado y eliminado por el propio comando (requiere Docker)
pnpm test

# Solo algunos archivos o proyectos (argumentos para Vitest), con la misma base temporal
pnpm test apps/api/test/integration/sale.controller.integration.spec.ts
pnpm test --project @farmacia/api

# Ejecutar pruebas del frontend (React Testing Library y Vitest)
pnpm --filter @farmacia/web test

# Modo observación con base temporal (se elimina al salir con Ctrl+C)
pnpm test:watch

# Comprobar tipos y empaquetar aplicaciones para producción
pnpm build

# Ejecutar linter estricto de código
pnpm lint
```

### 5.1 Aislamiento de la base de pruebas

`pnpm test` (`infra/scripts/test-with-ephemeral-db.sh`) nunca usa la base de desarrollo ni la de producción. Requiere Docker y el cliente PostgreSQL 18 o superior (`pg_dump`, `pg_restore`, `pg_isready`, `psql`), porque la prueba de respaldos ejecuta `pg_dump` real; con un cliente anterior se detiene antes de empezar.

1. Crea un contenedor `farmacontrol-test-<id>` (`postgres:18-alpine`) con credenciales aleatorias (pasadas por archivo, no por la línea de comandos), puerto asignado por Docker solo en `127.0.0.1`, datos en `tmpfs` y la etiqueta `com.farmacontrol.test-run=<id>`.
2. Marca su base con `COMMENT ON DATABASE farmacia_test IS 'farmacontrol-test-run:<id>'` desde dentro del contenedor.
3. Descarta toda variable `PG*` heredada (`PGHOSTADDR`, `PGSERVICE`, `PGPASSFILE`, `PGOPTIONS`...), exporta un entorno de conexión completo (`DATABASE_URL`, `DATABASE_TEST_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) y deja de leer los `.env` locales. Comprueba con `psql`, que usa la misma libpq que `pg_dump`, que ese entorno llega a la base marcada.
4. Crea un directorio temporal propio (`FARMACIA_TEST_RUN_DIR`, permisos 0700, con sello `.farmacontrol-test-run`). `BACKUP_DIR` es su subdirectorio `backups`: la retención de `backup.sh` nunca recorre respaldos reales y no hay destino externo.
5. Verifica el aislamiento, aplica las migraciones, ejecuta Vitest en su propio grupo de procesos y guarda la salida en `.test-runs/<id>.log`.
6. Al terminar, aunque fallen las pruebas, se interrumpa con Ctrl+C o reciba SIGTERM, detiene solo sus procesos y elimina solo el contenedor cuyo nombre y etiqueta coinciden (también si `docker run` falló a medias) y su directorio temporal. `FARMACIA_TEST_KEEP=1 pnpm test` conserva el contenedor para investigar un fallo.

Los proyectos que usan PostgreSQL (api, database, worker), `pnpm db:test:migrate` y `cleanTestDatabase` se detienen antes de tocar datos si la base alcanzada no tiene la marca de la ejecución en curso, si hay variables `PG*` no admitidas o si `BACKUP_DIR` no es el directorio de respaldos de la ejecución (rutas canónicas, sin enlaces simbólicos). Un nombre terminado en `_test` no basta. Por eso `vitest` o `pnpm --filter @farmacia/api test` ejecutados directamente fallan con un mensaje que remite a `pnpm test`. `backup.sh` repite la comprobación del directorio antes de escribir cuando corre dentro de una ejecución de pruebas. Las pruebas del frontend (`pnpm --filter @farmacia/web test`) no usan base de datos y pueden ejecutarse sin Docker.

`bash tests/infra/check-test-runner.sh` verifica el propio script: cliente PostgreSQL anterior, `docker run` fallido a medias, fallo de Vitest, SIGINT, SIGTERM y ejecución correcta, sin dejar contenedores, directorios ni procesos, y sin tocar contenedores de otras ejecuciones.

Si el script se lanza en segundo plano desde un shell sin control de trabajos (por ejemplo `pnpm test &` dentro de otro script), bash le entrega SIGINT ignorado y no puede capturarlo; SIGTERM sigue limpiando correctamente.

---

## 6. Procedimientos de Respaldo y Recuperación ante Desastres (DR)

### 6.1 Generar una Copia de Seguridad Inmediata

```bash
./infra/scripts/backup.sh
```

El volcado se almacena en `infra/backups/` con extensión `.dump`, formato custom comprimido, hash `.sha256` y metadatos `.meta.json`.

### 6.2 Validar la Integridad de un Respaldo

```bash
./infra/scripts/verify-backup.sh infra/backups/farmacia_backup.dump
```

### 6.3 Restaurar una Copia de Seguridad

```bash
./infra/scripts/restore.sh infra/backups/farmacia_backup.dump --target-db farmacia_db --confirm-overwrite
```

Para el protocolo completo de contingencia, tiempos comprometidos (RPO ≤ 15 min, RTO ≤ 4 horas) y simulacros semestrales, consultar el [Runbook de Backup y Restauración](docs/runbooks/backup-restore.md).

---

## 7. Licencia y Cumplimiento Normativo

Desarrollado bajo principios de buenas prácticas de dispensación farmacéutica, trazabilidad sanitaria de medicamentos y las directrices de arquitectura consignadas en `AGENTS.md`.
