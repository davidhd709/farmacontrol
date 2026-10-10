# Orquestación del Equipo de Desarrollo — FarmaControl

Este documento define cómo el agente principal coordina los agentes personalizados del proyecto. La fuente general de reglas es [`AGENTS.md`](../AGENTS.md) y el roadmap está en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

## 1. Estructura del equipo

La configuración ejecutable de Codex vive en `.codex/agents/*.toml`. Las reglas ampliadas de cada especialidad viven en `.agents/rules/*.md`.

| Rol                           | Agente Codex                                                        | Regla de dominio                                                                    | Responsabilidad                                                |
| ----------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Orquestador                   | [`orquestador.toml`](../.codex/agents/orquestador.toml)             | [`agente-orquestador.md`](../.agents/rules/agente-orquestador.md)                   | Alcance, delegación, integración, validación y entrega final.  |
| Arquitectura y requerimientos | [`arquitecto.toml`](../.codex/agents/arquitecto.toml)               | [`subagente-arquitecto.md`](../.agents/rules/subagente-arquitecto.md)               | Requerimientos, decisiones pendientes, arquitectura y slices.  |
| Backend y FEFO                | [`backend_fefo.toml`](../.codex/agents/backend_fefo.toml)           | [`subagente-backend-fefo.md`](../.agents/rules/subagente-backend-fefo.md)           | NestJS, dominio, API, transacciones, FEFO e idempotencia.      |
| Base de datos                 | [`database.toml`](../.codex/agents/database.toml)                   | [`subagente-database.md`](../.agents/rules/subagente-database.md)                   | PostgreSQL, Prisma, migraciones, índices y concurrencia.       |
| Frontend POS                  | [`frontend_pos.toml`](../.codex/agents/frontend_pos.toml)           | [`subagente-frontend-pos.md`](../.agents/rules/subagente-frontend-pos.md)           | React, UX/UI, accesibilidad, formularios y consumo de API.     |
| QA y concurrencia             | [`qa_concurrencia.toml`](../.codex/agents/qa_concurrencia.toml)     | [`subagente-qa-concurrencia.md`](../.agents/rules/subagente-qa-concurrencia.md)     | Pruebas, regresión, autorización, idempotencia y concurrencia. |
| Calidad y seguridad           | [`auditor_seguridad.toml`](../.codex/agents/auditor_seguridad.toml) | [`subagente-auditor-seguridad.md`](../.agents/rules/subagente-auditor-seguridad.md) | Auditoría independiente de calidad y seguridad.                |
| DevOps y operación            | [`devops.toml`](../.codex/agents/devops.toml)                       | [`subagente-devops.md`](../.agents/rules/subagente-devops.md)                       | Contenedores, proxy, VPS, observabilidad, backups y release.   |

## 2. Autoridad del orquestador

El orquestador es la única interfaz responsable de:

1. interpretar la solicitud del usuario;
2. definir el slice y sus criterios de aceptación;
3. decidir qué especialistas participan y en qué orden;
4. resolver solapamientos de archivos antes de delegar;
5. integrar y revisar todos los cambios;
6. verificar la definición de terminado;
7. emitir la respuesta final.

Los subagentes no amplían el alcance, no comienzan el siguiente slice y no sustituyen al orquestador en la decisión final.

## 3. Matriz de enrutamiento

| Si la tarea afecta...                       | Agente líder             | Agentes de apoyo                       |
| ------------------------------------------- | ------------------------ | -------------------------------------- |
| Alcance, reglas pendientes o arquitectura   | `arquitecto`             | Especialista técnico correspondiente   |
| Prisma, tablas, índices o migraciones       | `database`               | `backend_fefo`, `qa_concurrencia`      |
| API, dominio, inventario, ventas o worker   | `backend_fefo`           | `database`, `qa_concurrencia`          |
| Pantallas, formularios, POS o accesibilidad | `frontend_pos`           | `backend_fefo`, `qa_concurrencia`      |
| Bugs o regresiones                          | Especialista propietario | `qa_concurrencia`, `auditor_seguridad` |
| Seguridad, permisos o secretos              | Especialista propietario | `auditor_seguridad`                    |
| Docker, VPS, TLS, backups o despliegue      | `devops`                 | `auditor_seguridad`, `qa_concurrencia` |
| Revisión previa a cierre                    | `auditor_seguridad`      | `qa_concurrencia`                      |

## 4. Flujo de un slice

```text
Solicitud
  -> Orquestador define alcance y criterios
  -> Arquitecto valida cuando existe ambigüedad o impacto transversal
  -> Database prepara esquema si corresponde
  -> Backend / Frontend implementan con propiedad de archivos disjunta
  -> Orquestador integra
  -> QA ejecuta pruebas proporcionales al riesgo
  -> Auditor revisa el diff en modo lectura
  -> Orquestador corrige bloqueantes, valida y entrega
```

DevOps entra en el punto donde haya cambios de infraestructura y vuelve a participar en la validación operativa final.

## 5. Paralelismo y propiedad de archivos

- Se permiten hasta tres subagentes simultáneos.
- Las tareas paralelas deben ser independientes y aportar valor aunque otra falle.
- Sólo un agente puede escribir un archivo durante una ronda.
- `packages/contracts/` se asigna explícitamente porque puede afectar backend y frontend.
- Las migraciones pertenecen a `database`; backend no las modifica en paralelo.
- QA y auditor trabajan preferentemente después de integrar; auditor siempre es de sólo lectura.
- Si aparece solapamiento, el orquestador pausa una rama y reasigna el archivo.

## 6. Contrato de delegación

Toda instrucción a un subagente debe indicar:

```text
Objetivo:
Alcance incluido:
Fuera de alcance:
Archivos o directorios permitidos:
Dependencias y decisiones confirmadas:
Validaciones obligatorias:
Resultado esperado:
```

No se delegan solicitudes vagas como “haz el backend” o “revisa todo”.

## 7. Contrato de handoff

Cada subagente devuelve un resumen estructurado:

```text
Estado: PENDIENTE | EN PROGRESO | IMPLEMENTADO | BLOQUEADO
Alcance atendido:
Archivos leídos:
Archivos modificados:
Cambios o hallazgos:
Pruebas ejecutadas y resultado:
Decisiones:
Pendientes o bloqueos:
Siguiente paso recomendado:
```

Las afirmaciones deben incluir rutas, símbolos, comandos o resultados verificables. Los logs extensos se resumen y permanecen fuera del hilo principal.

## 8. Definition of Done

El orquestador sólo marca un slice como `IMPLEMENTADO` cuando:

- cumple los criterios de aceptación;
- no inventa decisiones pendientes;
- formatter, lint y typecheck fueron ejecutados;
- el build relevante termina correctamente;
- las pruebas proporcionales al riesgo pasan;
- las reglas críticas usan PostgreSQL real cuando corresponde;
- el diff fue revisado y no contiene secretos ni cambios fuera de alcance;
- seguridad y autorización fueron verificadas;
- la documentación afectada quedó actualizada;
- existen pendientes y siguiente paso explícitos.

## 9. Bloqueos y escalamiento

El subagente devuelve `BLOQUEADO` cuando necesita una decisión no confirmada, autoridad adicional o una dependencia externa. El orquestador:

1. conserva la evidencia reunida;
2. continúa con partes independientes si existen;
3. no inventa la decisión faltante;
4. formula al usuario una pregunta concreta;
5. reanuda únicamente la parte bloqueada cuando recibe respuesta.

## 10. Uso desde Codex

Ejemplo de solicitud:

```text
Usa el equipo multiagente para implementar este slice. Haz que arquitecto valide el alcance; database revise el impacto de esquema; backend_fefo y frontend_pos trabajen sólo si sus archivos no se solapan; qa_concurrencia valide el resultado y auditor_seguridad haga la revisión final. Espera a todos y consolida una sola entrega.
```

Codex carga la configuración del proyecto al iniciar una sesión. Después de cambiar `.codex/config.toml` o `.codex/agents/*.toml`, inicia una sesión nueva para asegurar que los perfiles estén disponibles.

## 11. Orquestación con tres proveedores (Claude, Codex y Gemini)

Los roles de este documento no cambian; lo que cambia es el motor que ejecuta cada uno. Claude Code orquesta y delega en los CLIs de Codex y Gemini, cada uno autenticado con su propia suscripción (sin claves de API).

| Rol                                                                     | Motor                      | Cómo se invoca                                                                         |
| ----------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Orquestador y arquitecto                                                | Claude Code (Claude Pro)   | Sesión principal; `CLAUDE.md` y comando `/slice`                                       |
| `database`, `backend_fefo`, `frontend_pos`, `qa_concurrencia`, `devops` | Codex CLI (ChatGPT Plus)   | Subagente `.claude/agents/codex-dev.md` → `codex exec --sandbox workspace-write`       |
| `auditor_seguridad`                                                     | Gemini CLI (Google AI Pro) | Subagente `.claude/agents/gemini-auditor.md` → diff por entrada estándar, sólo lectura |
| Lectura de documentos y exploración amplia                              | Gemini CLI (Google AI Pro) | Subagente `.claude/agents/gemini-analista.md`, sólo lectura                            |

Motivos del reparto:

- La auditoría la hace un modelo distinto al que escribió el código, para que la revisión sea realmente independiente.
- Codex ya tiene los perfiles de implementación en `.codex/agents/` y los reutiliza tal cual.
- Gemini descarga del hilo del orquestador la lectura de documentos largos (`PLAN_DESARROLLO.md`, requerimientos, auditorías).

### Requisitos en la máquina de desarrollo

```bash
npm install -g @anthropic-ai/claude-code @openai/codex @google/gemini-cli
claude          # iniciar sesión con la cuenta de Claude Pro
codex login     # "Sign in with ChatGPT"
gemini          # "Login with Google" con la cuenta de Google AI Pro
```

Abre el repositorio con `claude` desde la raíz y verifica con `/agents` que aparecen `codex-dev`, `gemini-auditor` y `gemini-analista`.

### Reglas adicionales

- Las reglas de las secciones 2 a 9 aplican igual: contrato de delegación, handoff, un escritor por archivo y Definition of Done.
- Si dos subagentes de Codex escriben en paralelo, cada uno trabaja en su propio `git worktree`; el orquestador integra.
- Prohibido `--yolo`, `--approval-mode yolo`, `--dangerously-bypass-approvals-and-sandbox` y `--sandbox danger-full-access` (bloqueados también en `.claude/settings.json`).
- Cada CLI consume la cuota de su suscripción. Si un subagente devuelve `BLOQUEADO` por límite de uso, el orquestador decide si espera la ventana o hace el trabajo él mismo, y lo informa.
- El flujo con Codex como orquestador (sección 10) sigue disponible; no se usan los dos esquemas a la vez sobre la misma rama.
