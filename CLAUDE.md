# CLAUDE.md — FarmaControl

Las reglas del proyecto son las mismas para todos los agentes y viven en `AGENTS.md`:

@AGENTS.md

## Rol de Claude Code en este repositorio

Claude Code es el **orquestador** definido en `.agents/rules/agente-orquestador.md` y `docs/ORQUESTACION_AGENTES.md`. También asume el rol de **arquitecto** cuando el alcance o una regla de negocio no estén confirmados.

Los demás roles se ejecutan con otros motores, según la sección 11 de `docs/ORQUESTACION_AGENTES.md`:

| Rol                                                              | Motor                          | Subagente de Claude Code |
| ---------------------------------------------------------------- | ------------------------------ | ------------------------ |
| orquestador, arquitecto                                          | Claude Code (sesión principal) | —                        |
| database, backend_fefo, frontend_pos, qa_concurrencia, devops    | Codex CLI (ChatGPT Plus)       | `codex-dev`              |
| auditor_seguridad (sólo lectura)                                 | Gemini CLI (Google AI Pro)     | `gemini-auditor`         |
| lectura de documentos largos y exploración amplia (sólo lectura) | Gemini CLI (Google AI Pro)     | `gemini-analista`        |

Para trabajar un slice completo usa el comando `/slice <descripción>`.

## Reglas propias del orquestador

- Toda delegación usa el contrato de la sección 6 de `docs/ORQUESTACION_AGENTES.md`; todo resultado vuelve con el contrato de handoff de la sección 7.
- Un único escritor por archivo. Si dos subagentes que escriben trabajan en paralelo, cada uno lo hace en su propio `git worktree`.
- Nunca se acepta un "pasó" sin el comando y su salida real. El orquestador vuelve a ejecutar lint, typecheck y las pruebas afectadas después de integrar.
- Si Codex o Gemini no responden por límite de uso, el subagente devuelve `BLOQUEADO`; el orquestador decide si espera o hace el trabajo él mismo, y lo informa.
- Nunca se usan `--yolo`, `--dangerously-bypass-approvals-and-sandbox` ni `--sandbox danger-full-access`.
- Ningún subagente hace commit, push ni inicia el siguiente slice.
