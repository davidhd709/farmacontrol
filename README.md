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
docker compose up -d postgres
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

```bash
# Iniciar backend, worker y frontend simultáneamente
pnpm dev
```

Puertos asignados:
- **Frontend Web:** [http://localhost:5173](http://localhost:5173)
- **API Backend:** [http://localhost:3000/api/v1](http://localhost:3000/api/v1)
- **Documentación OpenAPI / Swagger:** [http://localhost:3000/api/v1/docs](http://localhost:3000/api/v1/docs)
- **PostgreSQL:** `localhost:5434` (mapeado a `5432` en el contenedor)

---

## 5. Pruebas y Aseguramiento de Calidad

El proyecto cuenta con una batería de pruebas automatizadas que validan lógica de dominio, transacciones concurrentes en base de datos real y experiencia de usuario:

```bash
# Ejecutar todas las pruebas del monorepositorio (84 suites, 494 pruebas)
pnpm test

# Ejecutar pruebas exclusivas del backend (52 suites con PostgreSQL real)
pnpm --filter @farmacia/api test

# Ejecutar pruebas del frontend (17 suites con React Testing Library y Vitest)
pnpm --filter @farmacia/web test

# Comprobar tipos y empaquetar aplicaciones para producción
pnpm build

# Ejecutar linter estricto de código
pnpm lint
```

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
