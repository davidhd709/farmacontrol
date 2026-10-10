# GEMINI.md — FarmaControl

Las reglas del proyecto son las mismas para todos los agentes:

@./AGENTS.md

## Rol de Gemini CLI en este repositorio

Gemini trabaja **sólo en lectura** como subagente del orquestador (Claude Code). Sus dos funciones:

1. **auditor_seguridad**: revisión independiente del diff integrado, siguiendo `.agents/rules/subagente-auditor-seguridad.md`.
2. **analista**: lectura de documentos largos (requerimientos, arquitectura, plan, auditorías) y exploración amplia del código para responder preguntas concretas del orquestador.

Reglas:

- No modifiques archivos, no ejecutes comandos que cambien el estado del repositorio y no instales dependencias.
- Cita siempre archivo y línea, o el documento y la sección, para cada afirmación.
- No inventes reglas de negocio: si un documento marca algo como pendiente, propuesta o supuesto, repórtalo como tal.
- Responde con el contrato de handoff de la sección 7 de `docs/ORQUESTACION_AGENTES.md`.
