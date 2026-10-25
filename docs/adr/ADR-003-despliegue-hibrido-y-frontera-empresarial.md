# ADR-003: Despliegues dedicado y compartido con empresa como frontera de datos

- **Estado:** Aprobado para orientar el diseño; detalles físicos y migración pendientes.
- **Fecha:** 2026-10-24
- **Origen:** Plan híbrido de implementación y aprobación explícita del propietario.
- **Alcance:** modo de despliegue y frontera empresarial; no aprueba reglas contables o tributarias particulares.

## Contexto

El sistema actual es un monolito modular con NestJS, React, Prisma y PostgreSQL. El esquema y la sesión actuales no contienen Company, Branch, CompanyMembership ni companyId. Las entidades transaccionales, reportes, jobs, exportaciones y consultas por identificador tampoco tienen ámbito de empresa.

El plan aprobado requiere un producto único con dos modalidades:

- **Dedicada:** una instancia de aplicación y una base por empresa.
- **Compartida:** una aplicación y una base con varias empresas aisladas.

Los dos modos deben conservar el mismo código, esquema evolutivo, lógica contable, migraciones y pruebas. Empresa es la frontera jurídica y de datos; una sucursal pertenece a una empresa y no constituye otro tenant. Esta decisión queda descrita en las secciones 1–3 del [plan híbrido](../FarmaControl_Arquitectura_Hibrida_Plan_Implementacion.md).

## Decisión

1. Se desarrollará y mantendrá un solo producto/código base para modo dedicado y compartido.
2. El modelo persistirá contexto de empresa también en una instalación dedicada de una sola empresa.
3. Company será la frontera de autorización y datos. Branch estará subordinada a Company.
4. DEPLOYMENT_MODE podrá gobernar el aprovisionamiento y si se permite registrar más de una empresa; no cambiará las reglas contables.
5. No se habilitará el modo compartido hasta que las pruebas de aislamiento con varias empresas, sucursales y usuarios hayan pasado.
6. Esta ADR no define todavía los modelos Prisma finales, la lista definitiva de entidades globales/propias, restricciones compuestas, índices/FKs exactos, estrategia de backfill, alcance por sucursal ni si se adopta RLS.

## Alternativas consideradas

| Alternativa                                                                                      | Resultado                                                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Mantener una sola edición funcional y usar DB dedicada o compartida según instalación            | Seleccionada; es la arquitectura aprobada por el propietario.                     |
| Crear dos forks o ediciones con reglas y esquema diferentes                                      | Descartada; duplica código y deriva contabilidad y pruebas.                       |
| Usar Branch como frontera de tenant                                                              | Descartada; contradice la decisión explícita de que sucursal pertenece a empresa. |
| Omitir companyId en instalaciones dedicadas                                                      | Descartada; rompe la compatibilidad de código/esquema declarada para ambos modos. |
| Habilitar el compartido antes de cubrir APIs, jobs, exportaciones, reportes y relaciones de base | Descartada por el criterio de aislamiento obligatorio.                            |

## Consecuencias

- Autenticación y autorización deberán resolver la empresa autorizada en el servidor y comprobar membresía antes de leer o modificar datos.
- Toda entidad propiedad de una empresa, sus claves de negocio y relaciones entre entidades deberán respetar esa frontera. Las referencias realmente globales deberán decidirse explícitamente.
- Deben revisarse consultas por ID, filtros, payloads con referencias, reportes, exports, auditoría, idempotencia, jobs, alertas y operación de respaldos/restauración.
- Location representa una ubicación de inventario en el modelo actual; no puede asumirse que ya representa una Branch.
- El esquema actual usa unicidades globales. Su conversión a restricciones compuestas requiere inventario de duplicados y decisión explícita por entidad.
- La base protege la inmutabilidad de varios históricos con triggers. El backfill de empresa debe diseñarse y probarse sin actualizar silenciosamente dichos registros.
- Row Level Security queda como evaluación, no como requisito aprobado de implementación. Si se adopta, se debe verificar con Prisma, pool de conexiones y transacciones; no sustituye permisos de aplicación ni pruebas.
- La estrategia de backups de una base dedicada no implica restauración parcial y segura de una empresa dentro de una base compartida.

## Límites de esta decisión y asuntos pendientes

La regla de atomicidad contable quedó aprobada después de F0 y se registra en [ADR-004](ADR-004-atomicidad-operativa-contable.md). Su implementación corresponde a F1.

La política de costeo quedó aprobada el 2026-10-25 en [ADR-005](ADR-005-politica-de-costeo-del-inventario.md). Siguen pendientes los saldos de apertura y la fecha de corte, la matriz fiscal por empresa/producto/operación, el alcance de cada entidad por sucursal, las cuentas/mapeos aprobados y el proveedor de facturación electrónica. El plan híbrido requiere validación de dichas reglas antes de implementarlas.

El inventario y la matriz de transición de F0 están en [F0_linea_base_arquitectura_hibrida.md](../F0_linea_base_arquitectura_hibrida.md). La alineación documental quedó hecha al cerrar F0, el 2026-10-25. El plan híbrido refleja las decisiones aprobadas, y la arquitectura y el plan de desarrollo remiten a este ADR en los puntos de SaaS y sedes.

## Condiciones de revisión

Revisar este ADR si el propietario cambia entre un producto único y ediciones funcionalmente separadas, si la frontera legal de datos cambia, o si una decisión aprobada contradice el mismo código/esquema para dedicado y compartido. Revisar cualquier diseño de RLS, backfill o alcance por sucursal en ADR o documentación específica antes de implementación.
