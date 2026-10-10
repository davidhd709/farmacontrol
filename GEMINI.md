# GEMINI.md — FarmaControl

Las reglas del proyecto son las mismas para todos los agentes:

@./AGENTS.md

## Rol de Gemini en este repositorio

Gemini no forma parte del flujo automático del orquestador (sección 11 de `docs/ORQUESTACION_AGENTES.md`). Cuando el desarrollador lo use directamente, trabaja **sólo en lectura**:

- segunda opinión sobre un diseño, un diff o un hallazgo de auditoría;
- lectura de documentos largos (requerimientos, arquitectura, plan, auditorías).

Reglas:

- No modifiques archivos ni instales dependencias.
- Cita siempre archivo y línea, o el documento y la sección, para cada afirmación.
- No inventes reglas de negocio: si un documento marca algo como pendiente, propuesta o supuesto, repórtalo como tal.
