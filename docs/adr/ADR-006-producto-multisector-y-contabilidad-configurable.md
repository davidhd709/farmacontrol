# ADR-006: Producto multisector con contabilidad configurable por empresa

- **Estado:** Aprobado, incluido el orden de fases (aprobado el 2026-10-25)
- **Fecha:** 2026-10-25
- **Origen:** decisión explícita del propietario
- **Reemplaza en parte:** la nota de alcance farmacéutico del [plan híbrido](../FarmaControl_Arquitectura_Hibrida_Plan_Implementacion.md#1-decisión-de-producto) y la regla de [ADR-005](ADR-005-politica-de-costeo-del-inventario.md) de que el promedio ponderado es el único método

## Contexto

FarmaControl nació como sistema para farmacias y droguerías. Los requerimientos, el POS y el inventario suponen lotes y vencimientos obligatorios y salida FEFO. La contabilidad avanzó con decisiones fijas que quedaban pendientes de validar con la contadora: método de costeo, tratamiento tributario, diferencias de notas débito, bonificaciones y fecha de corte. Esa dependencia frenaba las fases y ataba el producto a un solo cliente.

El propietario decidió que el producto debe servir a negocios pequeños, medianos y grandes de **cualquier sector**, y que cada negocio pueda personalizar su contabilidad sin depender de la validación de un contador para que el sistema avance.

## Decisión

1. **Todo el sistema es multisector.**
   - POS, catálogo e inventario dejan de asumir farmacia.
   - El control por lote, el vencimiento, FEFO y las reglas sanitarias pasan a ser opciones por empresa y por producto.
   - La farmacia queda como un **perfil sectorial** que activa esas opciones por defecto.
2. **Solo Colombia.**
   - Plan de cuentas basado en el PUC, con plantillas por sector, y moneda COP.
   - Impuestos colombianos (IVA, INC, retenciones, ICA) como **tipos configurables**. Sus tarifas, vigencias y aplicabilidad las define cada empresa; ninguna tarifa ni cuenta queda fija en el código.
3. **La contabilidad se configura por empresa.**
   - Toda política contable o fiscal es configuración de la empresa: valor por defecto, versión, vigencia y registro de quién la cambió.
   - Las preguntas abiertas para la contadora dejan de bloquear fases: se convierten en parámetros con un valor por defecto documentado.
4. **Tres métodos de costeo, a elección de cada empresa:**
   - promedio ponderado móvil (ADR-005, implementado en F2, valor por defecto);
   - PEPS (primeras entradas, primeras salidas), por capas de costo;
   - costo identificado por lote.

   FEFO, o el orden físico que corresponda, sigue siendo independiente del método contable. El método se elige al configurar la empresa. Cambiarlo después exige un procedimiento controlado al cierre de un período, con revaluación documentada; nunca un recálculo silencioso del pasado.

5. **El sistema asegura integridad contable y cumplimiento fiscal colombiano** (corregido el 2026-10-25 a pedido del propietario).
   - **Integridad:** partida doble, inmutabilidad, atomicidad (ADR-004), períodos y conciliaciones.
   - **Catálogo normativo colombiano versionado por vigencia, mantenido por el producto y no por cada negocio:**
     - las tarifas de IVA (19 %, 5 %) y los tratamientos excluido y exento;
     - el INC;
     - los conceptos de retención en la fuente, con sus bases mínimas en UVT;
     - ReteIVA y ReteICA;
     - el valor anual de la UVT;
     - las responsabilidades del RUT: responsable de IVA, régimen simple, gran contribuyente, autorretenedor.
   - **Configuración acotada a la norma:** cada negocio declara sus responsabilidades fiscales y clasifica productos y terceros eligiendo solo tratamientos que el catálogo permite. Las tarifas municipales de ICA las registra la empresa dentro de los rangos del catálogo.
   - **Bloqueo de lo que no cumple:** el sistema calcula IVA, INC y retenciones según las responsabilidades de las dos partes y las bases mínimas, y rechaza las operaciones que contradicen el catálogo. Por ejemplo, no deja cobrar IVA a quien no es responsable, ni confirmar ventas sin numeración autorizada.
   - **Revisión del catálogo:** su contenido lo revisa un asesor tributario una vez a nivel de producto, y se actualiza con cada cambio normativo: UVT anual, reformas. No se revisa por cliente.
6. **Documentos electrónicos DIAN.**
   - La **facturación electrónica** (factura, notas crédito y débito, documento soporte) y la **nómina electrónica** quedan para una actualización futura.
   - La arquitectura queda preparada desde ahora:
     - datos fiscales de la empresa y de los terceros;
     - resoluciones de numeración;
     - estado fiscal del documento, separado del asiento;
     - un puerto de envío con dos adaptadores configurables por empresa: proveedor tecnológico autorizado o transmisión directa como software propio.
   - Según ADR-004, el envío ocurre fuera de la transacción contable, con estado persistente y reintentos.

## Consecuencias

- **Lo que ya existe sigue valiendo:** F1 (atomicidad) y F2 (submayor) se conservan. Lo que hoy está fijo pasa a configuración:
  - el método de costeo;
  - la cuenta de la diferencia de notas débito, hoy `COST_OF_SALES`;
  - el tratamiento de bonificaciones;
  - la apertura automática y su fecha de corte;
  - los propósitos contables de cada operación.
- **La empresa pasa a ser la dueña de la configuración.** Hace falta un modelo `Company`, con su configuración contable, antes del motor tributario y de los métodos de costeo. Las tablas operativas reciben `companyId` según [ADR-003](ADR-003-despliegue-hibrido-y-frontera-empresarial.md).
- **El catálogo distingue tipos de producto y modos de control de inventario:**
  - servicio, sin inventario;
  - inventario simple, sin lote;
  - por lote;
  - por lote con vencimiento;
  - por serie.

  El POS y las reglas de salida se adaptan al modo de cada producto.

- **Los requerimientos rectores están escritos para farmacia.** Se conservan como especificación del perfil farmacia y se complementan con requerimientos multisector. Este ADR prevalece donde haya conflicto.
- **El alcance crece de forma considerable.** El plan de fases se reorganiza abajo.

## Orden de fases (aprobado)

F0, F1 y F2 están cerradas. Las fases siguientes reemplazan F3–F8 del plan híbrido:

| Fase                                                  | Contenido                                                                                                                                                                                                                                       | Por qué en este orden                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **F3 — Empresa y configuración contable base**        | `Company` y `Branch` en modo de una sola empresa; `CompanyAccountingSettings` con políticas versionadas (método de costeo, cuentas de diferencias, bonificaciones, fecha de corte); perfil sectorial                                            | Toda la configuración posterior cuelga de la empresa   |
| **F4 — Catálogo e inventario multisector**            | Tipos de producto y modos de control; lote y vencimiento opcionales; salida FEFO solo con vencimiento, si no por orden de entrada; POS adaptado; reglas de farmacia como perfil                                                                 | Desacopla el producto del sector farmacéutico          |
| **F5 — Costeo configurable**                          | PEPS por capas y costo identificado por lote junto al promedio; estrategia por empresa; procedimiento de cambio de método                                                                                                                       | Usa la configuración de F3 y los modos de F4           |
| **F6 — Catálogo normativo y motor tributario**        | Catálogo colombiano versionado (IVA, INC, retención en la fuente, ReteIVA, ReteICA, UVT, responsabilidades del RUT); clasificación de productos y terceros; cálculo y bloqueo por norma; instantánea por línea y por asiento; sin 0 % implícito | El antiguo F3, con las reglas en el catálogo normativo |
| **F7 — Plan de cuentas y asistente de configuración** | Plantillas PUC por sector, propósitos y mapeos versionados por empresa, saldos de apertura, estado READY                                                                                                                                        | El antiguo F5                                          |
| **F8 — Cobertura contable completa y reportes**       | Asientos de ajustes, vencimientos, caja y bancos manuales; libros oficiales y estados conciliados; borradores de los formularios 300 (IVA) y 350 (retención), ICA e información exógena                                                         | El antiguo F6, con los reportes fiscales               |
| **F9 — Multiempresa compartida y hardening**          | `companyId` en todo el modelo operativo, aislamiento, pruebas ofensivas, respaldos por empresa, RLS                                                                                                                                             | El antiguo F4 junto con el F7                          |
| **F10 — UAT y salida controlada**                     | Pruebas con negocios de varios sectores y tamaños                                                                                                                                                                                               | El antiguo F8                                          |
| **Futuro — Facturación electrónica DIAN**             | Factura, notas y documento soporte; puerto con adaptador de proveedor tecnológico y adaptador directo como software propio                                                                                                                      | Actualización posterior; la base se prepara en F3 y F6 |
| **Futuro — Nómina y nómina electrónica**              | Módulo de nómina (empleados, liquidación, seguridad social) y su transmisión electrónica                                                                                                                                                        | Actualización posterior; requiere un módulo nuevo      |

## Alternativas consideradas

| Alternativa                                                     | Resultado                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mantener farmacia y solo parametrizar la contabilidad           | No seleccionada: el propietario eligió multisector completo.                                             |
| Multipaís                                                       | Descartada por ahora: solo Colombia.                                                                     |
| Esperar la validación de la contadora para cada regla           | Descartada: las reglas pasan a ser configuración por empresa, dentro del catálogo normativo.             |
| Dejar el cumplimiento fiscal a la configuración de cada negocio | Descartada a pedido del propietario: el sistema debe asegurar el cumplimiento con un catálogo normativo. |
| Un solo método de costeo                                        | Descartada: cada empresa elige entre tres.                                                               |

## Definiciones del propietario (2026-10-25)

- **Orden de fases:** aprobado.
- **Perfiles sectoriales:** de entrada, el sistema trae solo el perfil **farmacia**. La arquitectura sigue siendo multisector, con tipos de producto y modos de control configurables, para poder agregar otros perfiles después sin rediseño. F4 construye los modos genéricos con los valores por defecto y la aceptación de farmacia.
- **Revisión del catálogo normativo:** la hace un asesor tributario externo, a nivel de producto y con cada cambio normativo. Esa revisión es condición para usar en producción el motor tributario (F6), no para desarrollarlo.

## Pendientes

- Revisar los requerimientos multisector (POS, inventario y catálogo), que hoy solo están descritos para farmacia.
