# Orquestación de Agentes y Subagentes — Sistema Farmacia

Este documento describe la estructura y el flujo de trabajo del **Agente Orquestador** y los **Subagentes especializados** configurados en el proyecto para asegurar el cumplimiento estricto de [AGENTS.md](../../AGENTS.md) y el [Plan de Desarrollo](../PLAN_DESARROLLO.md).

---

## 1. El Agente Orquestador (Rol Principal)

El Agente Orquestador es la interfaz principal contigo. Sus funciones son:
1. **Recibir el requerimiento o slice** a implementar según el [Plan de Desarrollo](../PLAN_DESARROLLO.md).
2. **Coordinar el flujo de trabajo incremental**:
   ```
   Requerimientos → Planificación → Arquitectura/DB → Implementación (Backend/Frontend) → Pruebas → Auditoría y Cierre
   ```
3. **Delegar en el subagente adecuado** según la fase actual.
4. **Verificar que ningún slice se dé por terminado** sin pruebas ejecutadas, typecheck y reporte formal.

---

## 2. Los Subagentes Especializados

Ubicados como reglas activas en `.agents/rules/`:

| Subagente | Archivo de Regla | Especialidad Principal | Skills Asociadas |
|---|---|---|---|
| **Arquitecto & Requerimientos** | [`subagente-arquitecto.md`](../.agents/rules/subagente-arquitecto.md) | Validación de alcance, detección de bloqueos y decisiones pendientes. | `levantar-requerimientos`, `planificar-proyecto`, `arquitectura-software` |
| **Backend & Dominio FEFO** | [`subagente-backend-fefo.md`](../.agents/rules/subagente-backend-fefo.md) | NestJS, 4 capas, reglas de negocio puras, motor FEFO y contratos OpenAPI. | `implementar-funcionalidad`, `revisar-backend`, `revisar-api` |
| **Base de Datos & PostgreSQL** | [`subagente-database.md`](../.agents/rules/subagente-database.md) | Prisma, PostgreSQL 18, migraciones inmutables, índices y tipos monetarios. | `revisar-base-datos`, `rendimiento` |
| **Frontend UX/UI (POS)** | [`subagente-frontend-pos.md`](../.agents/rules/subagente-frontend-pos.md) | React 19, MUI 9, velocidad de caja, prevención de doble clic y accesibilidad. | `diseno-ux-ui`, `impeccable`, `revisar-frontend` |
| **QA, Pruebas & Concurrencia** | [`subagente-qa-concurrencia.md`](../.agents/rules/subagente-qa-concurrencia.md) | Vitest, pruebas de concurrencia de lotes, idempotencia y validaciones. | `pruebas-qa`, `debugging` |
| **Auditor de Calidad & Seguridad** | [`subagente-auditor-seguridad.md`](../.agents/rules/subagente-auditor-seguridad.md) | Linter, typecheck, OWASP Top 10, cookies seguras, Docker y DevOps. | `calidad-codigo`, `revisar-seguridad`, `auditar-proyecto` |

---

## 3. Protocolo de Ejecución de un Slice

Para cada tarea o historia de usuario:

1. **Paso 1: Análisis (Subagente Arquitecto)**
   - Revisa si la historia tiene dependencias satisfechas o si contiene decisiones pendientes no resueltas.
2. **Paso 2: Datos (Subagente Base de Datos)**
   - Si requiere cambios de esquema, genera y valida la migración en Prisma sin tocar tablas históricas sin justificación.
3. **Paso 3: Lógica y Casos de Uso (Subagente Backend & FEFO)**
   - Implementa entidades de dominio puras, casos de uso transaccionales y endpoints en NestJS con DTOs y validación Zod/class-validator.
4. **Paso 4: Interfaz de Usuario (Subagente Frontend POS)**
   - Implementa componentes en React y vistas siguiendo la guía de estilos de MUI y navegación rápida.
5. **Paso 5: Pruebas (Subagente QA)**
   - Ejecuta las pruebas unitarias y de integración contra la base de datos real.
6. **Paso 6: Auditoría y Cierre (Subagente Auditor de Calidad)**
   - Ejecuta `pnpm lint`, `pnpm typecheck` y emite el resumen final con la estructura requerida en `AGENTS.md`.
