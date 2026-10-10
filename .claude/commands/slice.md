---
description: Ejecuta un slice completo con el equipo multiagente (Claude orquesta, Codex implementa y audita)
argument-hint: <descripción del slice o ítem del plan, por ejemplo "Fase 4 - fechas de negocio en America/Bogota">
---

Actúa como orquestador según `CLAUDE.md`, `.agents/rules/agente-orquestador.md` y `docs/ORQUESTACION_AGENTES.md`.

Slice solicitado: $ARGUMENTS

1. **Contexto.** Ubica el slice en `docs/ESTADO_AVANCE.md` y `docs/PLAN_DESARROLLO.md`. Si necesitas leer documentos largos, delega preguntas concretas al subagente `Explore`.
2. **Alcance.** Como arquitecto, define objetivo, criterios de aceptación verificables, archivos afectados y riesgos. Si el slice depende de una decisión pendiente del cliente (sección 4 de `docs/ESTADO_AVANCE.md`), detente y pregúntame.
3. **Plan.** Muéstrame el plan con el orden de roles (database → backend_fefo / frontend_pos → qa_concurrencia → auditor_seguridad, devops si aplica), los archivos que escribirá cada uno y qué va en paralelo. **Espera mi visto bueno antes de delegar.**
4. **Implementación.** Delega a `codex-dev` con el contrato de delegación completo. Si dos roles escriben en paralelo, crea un `git worktree` para cada uno y pásale su ruta.
5. **Integración.** Revisa el diff tú mismo, integra los worktrees y ejecuta `pnpm lint`, `pnpm typecheck` y las pruebas afectadas. Corrige lo que falle (directamente o con otra ronda de `codex-dev`).
6. **QA.** Delega a `codex-dev` con rol `qa_concurrencia` las pruebas proporcionales al riesgo.
7. **Auditoría.** Delega a `codex-auditor` contra `main`. Corrige los P0 y P1 confirmados y vuelve a ejecutar las pruebas.
8. **Cierre.** Actualiza `docs/ESTADO_AVANCE.md` si corresponde, deja commits pequeños según la sección 15 de `AGENTS.md` y entrega el resumen de la sección 17. No empieces el siguiente slice.
