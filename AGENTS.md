# AGENTS.md — Sistema de Gestión para Farmacia

## 1. Objetivo

Desarrollar un sistema web para la gestión operativa de una farmacia siguiendo estrictamente:

- `docs/levantamiento-requerimientos-farmacia.md`
- `docs/arquitectura-software-farmacia.md`
- `docs/diseno-ux-ui-farmacia.md`

Estos documentos son la fuente principal del proyecto.

No asumir como confirmado algo que los documentos indiquen como:

- pendiente;
- propuesta;
- supuesto;
- sujeto a validación.

Si una decisión pendiente afecta directamente una implementación, detener esa parte y reportarla antes de inventar una regla de negocio.

---

## 2. Forma de trabajo

El desarrollo será incremental.

Flujo general:

requerimientos
→ planificación
→ arquitectura
→ UX/UI
→ implementación
→ pruebas
→ revisión
→ seguridad/calidad
→ siguiente slice

No intentar desarrollar todo el sistema de una vez.

Cada funcionalidad debe dividirse en historias de usuario y slices pequeños, verificables y terminados.

Un slice no se considera terminado solamente porque compile.

Debe quedar:

- implementado;
- probado;
- revisado;
- documentado cuando corresponda;
- sin romper funcionalidad existente.

---

## 3. Skills disponibles

Usar explícitamente la skill adecuada antes de realizar trabajos importantes.

### Requerimientos y planificación

- `levantar-requerimientos`
- `planificar-proyecto`

### Arquitectura y diseño

- `arquitectura-software`
- `diseno-ux-ui`
- `impeccable`

### Desarrollo

- `implementar-funcionalidad`
- `debugging`
- `refactorizacion`

### Revisión técnica

- `revisar-frontend`
- `revisar-backend`
- `revisar-api`
- `revisar-base-datos`

### Calidad y seguridad

- `auditar-proyecto`
- `calidad-codigo`
- `revision-codigo`
- `pruebas-qa`
- `revisar-seguridad`
- `accesibilidad`
- `rendimiento`
- `revisar-dependencias`

### Operación

- `devops-despliegue`
- `observabilidad`
- `git-release`
- `documentacion-tecnica`

No utilizar todas las skills en cada tarea.
Seleccionar únicamente las necesarias para el trabajo actual.

---

## 4. Arquitectura obligatoria

Respetar la arquitectura aprobada del proyecto.

Arquitectura:

Monolito modular.

Repositorio:

apps/
api/
web/
worker/

packages/
database/
infra/
docs/
tests/

Backend:

- TypeScript
- Node.js
- NestJS

Frontend:

- React
- Vite
- Material UI
- React Router
- TanStack Query
- React Hook Form
- Zod

Base de datos:

- PostgreSQL

ORM:

- Prisma

API:

- REST
- `/api/v1`
- OpenAPI

Infraestructura:

- Docker
- Docker Compose
- Caddy

No introducir:

- microservicios;
- Kubernetes;
- Kafka;
- Redis;
- múltiples bases de datos;
- nuevas tecnologías importantes;

sin una justificación arquitectónica previa.

---

## 5. Capas del backend

Cada módulo debe respetar:

presentation/
application/
domain/
infrastructure/

Responsabilidades:

presentation

- HTTP
- controllers
- DTO
- serialización

application

- casos de uso
- coordinación
- transacciones

domain

- entidades
- reglas de negocio
- invariantes

infrastructure

- PostgreSQL
- Prisma
- almacenamiento
- servicios externos

El dominio no debe depender de:

- NestJS;
- Prisma;
- HTTP;
- infraestructura.

Los controladores no deben contener lógica de negocio.

Un módulo no debe modificar directamente las tablas pertenecientes a otro módulo saltándose sus contratos.

---

## 6. Reglas críticas del dominio

### FEFO

FEFO es una regla central.

Para medicamentos:

1. localizar lotes disponibles;
2. ordenar por fecha de vencimiento;
3. utilizar primero el lote con vencimiento más próximo;
4. controlar concurrencia;
5. registrar los lotes utilizados;
6. generar movimientos de inventario;
7. actualizar existencias;
8. ejecutar la operación dentro de una transacción.

Nunca implementar una venta que permita inconsistencias entre:

- venta;
- inventario;
- lotes;
- caja;
- cartera.

### Inventario

Los movimientos confirmados deben conservar trazabilidad.

Evitar eliminar o modificar silenciosamente movimientos históricos.

### Dinero

Nunca usar números de coma flotante para valores monetarios.

### Cantidades

Las cantidades de inventario deben manejarse mediante unidad base.

Las presentaciones comerciales deben conservar:

- presentación utilizada;
- cantidad;
- factor histórico;
- cantidad equivalente en unidad base.

### Seguridad

Los permisos siempre deben validarse en backend.

Ocultar botones en frontend no constituye autorización.

### Idempotencia

Operaciones críticas como:

- confirmar venta;
- registrar pagos;
- integraciones externas;

deben protegerse frente a ejecuciones duplicadas.

---

## 7. Base de datos

No crear tablas únicamente porque parezcan útiles.

Cada tabla debe corresponder a:

- un requerimiento;
- una decisión arquitectónica;
- una necesidad técnica demostrable.

Antes de crear una migración:

1. identificar requerimiento relacionado;
2. revisar modelo existente;
3. definir restricciones;
4. definir relaciones;
5. analizar índices;
6. analizar concurrencia;
7. revisar impacto en otros módulos.

Las migraciones aplicadas no deben modificarse retroactivamente.
Crear una migración nueva cuando sea necesario cambiar el esquema.

---

## 8. API

Mantener contratos REST explícitos.

No convertir operaciones de negocio importantes en CRUD genérico.

Ejemplos:

POST /api/v1/sales/{id}/confirm
POST /api/v1/sales/{id}/cancel
POST /api/v1/purchases/{id}/receive
POST /api/v1/receivables/{id}/payments

Validar:

- DTO;
- autenticación;
- autorización;
- reglas de negocio;
- estados;
- idempotencia;
- errores;
- códigos HTTP.

Mantener OpenAPI actualizado.

---

## 9. Frontend

El frontend debe seguir el documento UX/UI.

Prioridades:

1. velocidad de operación;
2. claridad;
3. prevención de errores;
4. accesibilidad;
5. responsive.

Nueva venta es una función prioritaria.

No llenar las pantallas con información innecesaria.

No utilizar gráficos decorativos.

No depender únicamente del color para comunicar:

- errores;
- estados;
- vencimientos;
- alertas.

Las operaciones críticas deben mostrar claramente su impacto antes de confirmar.

---

## 10. Pruebas

Cada funcionalidad debe incluir pruebas proporcionales al riesgo.

Considerar:

- unitarias;
- integración;
- API;
- base de datos;
- E2E;
- regresión;
- concurrencia;
- autorización;
- casos límite.

Las reglas críticas de inventario y FEFO requieren pruebas con PostgreSQL real cuando la prueba dependa del comportamiento transaccional o de bloqueos.

Nunca afirmar que algo funciona únicamente porque el código parece correcto.

Ejecutar las pruebas y reportar el resultado real.

---

## 11. Seguridad

Considerar desde el desarrollo:

- autenticación;
- autorización;
- sesiones;
- validación de entrada;
- inyección SQL;
- XSS;
- CSRF cuando aplique;
- exposición de información;
- secretos;
- rate limiting cuando corresponda;
- auditoría;
- OWASP Top 10.

Nunca almacenar secretos en el repositorio.

Nunca confiar en permisos provenientes únicamente del frontend.

---

## 12. Calidad

Antes de terminar un slice:

- ejecutar formatter;
- ejecutar lint;
- ejecutar typecheck;
- ejecutar pruebas;
- revisar cambios;
- comprobar regresiones.

No realizar refactorizaciones grandes dentro de una historia que tenga otro objetivo.

Si se descubre deuda técnica que no bloquea la historia:
documentarla y continuar con el alcance acordado.

---

## 13. Cambios

Antes de modificar código:

1. inspeccionar archivos relacionados;
2. entender arquitectura existente;
3. identificar requerimientos afectados;
4. identificar pruebas existentes;
5. definir el cambio mínimo necesario.

Después:

1. implementar;
2. ejecutar pruebas;
3. revisar diff;
4. informar archivos modificados;
5. informar pruebas ejecutadas;
6. informar problemas pendientes.

No realizar cambios masivos sin justificación.

---

## 14. Estado de una tarea

Usar:

- `PENDIENTE`
- `EN PROGRESO`
- `IMPLEMENTADO`
- `BLOQUEADO`

No marcar algo como IMPLEMENTADO si:

- faltan pruebas esenciales;
- no compila;
- existe un error conocido que invalida el flujo;
- falta una parte necesaria del mismo slice.

---

## 15. Commits

Mantener commits pequeños y relacionados con una sola intención.

Formato recomendado:

feat(catalog): add category creation
feat(inventory): add lot registration
feat(sales): implement FEFO allocation
fix(inventory): prevent negative lot balance
test(sales): cover concurrent FEFO allocation
refactor(catalog): extract product validation
docs(architecture): document inventory decision

No mezclar funcionalidades independientes en el mismo commit.

---

## 16. Prohibiciones

No:

- inventar requisitos;
- asumir reglas pendientes;
- cambiar arquitectura silenciosamente;
- instalar dependencias innecesarias;
- crear abstracciones sin uso real;
- desarrollar funcionalidades futuras antes de necesitarlas;
- introducir microservicios;
- ignorar errores de pruebas;
- desactivar pruebas para hacer pasar CI;
- eliminar validaciones para solucionar errores;
- ocultar errores con try/catch genéricos;
- modificar código funcional no relacionado con la tarea;
- afirmar que una prueba pasó sin ejecutarla.

---

## 17. Respuesta al terminar cada tarea

Entregar siempre un resumen con:

### Implementado

Qué se hizo.

### Archivos modificados

Archivos principales afectados.

### Pruebas

Comandos ejecutados y resultado.

### Decisiones

Decisiones técnicas tomadas.

### Pendientes

Problemas o decisiones todavía abiertas.

### Siguiente paso

Siguiente slice lógico.

No comenzar automáticamente el siguiente slice.

---

## 18. Equipo multiagente

El agente principal actúa como orquestador y debe seguir:

- `.agents/rules/agente-orquestador.md`
- `docs/ORQUESTACION_AGENTES.md`

Los agentes personalizados ejecutables están en `.codex/agents/` y sus reglas de dominio en `.agents/rules/`.

Delegar cuando existan subtareas independientes que puedan investigarse, implementarse o validarse en paralelo. Mantener el trabajo local en el agente principal cuando sea pequeño o secuencial.

Reglas de coordinación:

- máximo tres subagentes simultáneos;
- un único escritor por archivo;
- el arquitecto trabaja primero si hay alcance o reglas pendientes;
- database precede a backend cuando cambia el esquema;
- backend y frontend sólo trabajan en paralelo con contrato estable y archivos disjuntos;
- QA valida después de integrar;
- auditor_seguridad revisa en modo lectura antes del cierre;
- devops interviene en infraestructura, despliegue, observabilidad, backups y releases;
- el orquestador revisa el diff, consolida resultados y emite la respuesta final;
- ningún subagente inicia automáticamente el siguiente slice.

Cada delegación debe incluir objetivo, alcance, archivos permitidos, restricciones, dependencias, validaciones y resultado esperado.

Cada subagente debe devolver:

- estado: `PENDIENTE`, `EN PROGRESO`, `IMPLEMENTADO` o `BLOQUEADO`;
- alcance atendido;
- archivos leídos y modificados;
- cambios o hallazgos con evidencia;
- pruebas ejecutadas y resultado real;
- decisiones tomadas;
- pendientes y bloqueos;
- recomendación de siguiente paso, sin ejecutarlo.
