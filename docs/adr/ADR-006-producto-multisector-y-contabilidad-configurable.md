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

## Implementación de F3 (empresa y configuración contable base)

- **Modelo:** `companies`, `branches` y `company_accounting_policies`. En modo dedicado la base de datos admite **una sola empresa activa** (índice único parcial que F9 retirará) y **una sola sucursal principal** por empresa.
- **Validaciones de la empresa:**
  - el NIT se valida con el dígito de verificación de la DIAN (módulo 11);
  - el municipio, con su código DANE de 5 dígitos;
  - el perfil sectorial disponible es farmacia.
- **Políticas contables versionadas por vigencia**, de solo inserción con trigger. Cubren:
  - el método de costeo;
  - el costo de apertura de existencias (último costo de compra o costo del catálogo);
  - el propósito de la diferencia en notas débito: `COST_OF_SALES` o el nuevo `INVENTORY_COST_VARIANCE`;
  - el tratamiento de bonificaciones.
- **Reglas de las versiones:** una versión nueva rige desde hoy o después, nunca hacia atrás. Desde F5 están disponibles los tres métodos de costeo; cambiarlo sigue el procedimiento de la sección de F5.
- **Sin empresa configurada** rigen los valores por defecto, así que una instalación existente se comporta igual que antes de F3.
- **Contrato de lectura:** `accountingPolicyAt(cliente, día)` entrega la política vigente. El submayor de costos la usa en cada movimiento (método y costo de apertura) y la nota débito la usa para el propósito de la diferencia.
- **API:** `GET /company`, `POST /company/setup`, `PATCH /company`, `POST /company/branches` y `POST /company/accounting-policies`, con los permisos `company:read` (administrador y supervisor) y `company:manage` (administrador). Cada cambio queda en la auditoría.
- **Web:** pantalla "Empresa y Política Contable", con la configuración inicial, las sucursales, la política vigente, su historial y el formulario de versiones.

## Implementación de F4 (catálogo e inventario multisector)

Decisión de arquitectura del orquestador (2026-10-25), implementada el mismo día. Resuelve la estructura del saldo sin lote que pedían RF-034 y T-09 (decisión 2 de `docs/ESTADO_AVANCE.md`). Las cantidades fraccionarias siguen pendientes; la unidad base sigue siendo entera.

### Modos de control de inventario

Cada producto tiene un `inventoryControlMode`; reemplaza a `requiresLotControl`.

| Modo         | Existencia                                    | Lote        | Vencimiento | Salida                                                          |
| ------------ | --------------------------------------------- | ----------- | ----------- | --------------------------------------------------------------- |
| `SERVICE`    | Ninguna: no hay kardex, costo ni recepción    | —           | —           | La venta no toca inventario; costo 0                            |
| `SIMPLE`     | Un saldo por producto y ubicación             | Prohibido   | Prohibido   | Orden de entrada                                                |
| `LOT`        | Una existencia por lote                       | Obligatorio | Prohibido   | Orden de entrada                                                |
| `LOT_EXPIRY` | Una existencia por lote                       | Obligatorio | Obligatorio | FEFO; los vencidos no se venden                                 |
| `SERIAL`     | Una existencia por serie, con 0 o 1 unidad    | La serie    | Prohibido   | La venta indica las series; no hay asignación automática        |

### Modelo de datos

- **`inventory_lots` sigue siendo la unidad de existencia** de todos los modos físicos. Ningún movimiento queda sin existencia (`inventory_movements.lot_id` sigue obligatorio).
  - `lot_number` y `expiration_date` pasan a ser opcionales. No se inventan lotes ni fechas: el saldo `SIMPLE` es una fila con los dos en NULL.
  - Cada existencia guarda `control_mode`, el modo del producto al crearla. Con él, unos CHECK en la base de datos imponen la forma de cada modo (lote, vencimiento y cantidad máxima de 1 en `SERIAL`).
  - Índices únicos parciales: un solo saldo `SIMPLE` por producto y ubicación, y una serie no se repite dentro del mismo producto en ninguna ubicación.
- **Un trigger** exige que el `control_mode` de una existencia nueva coincida con el modo vigente del producto. Lee el producto con `FOR SHARE` para serializarse frente a un cambio de modo concurrente.
- **Cambio de modo:** solo se permite mientras el producto no tenga existencias registradas. Lo impone otro trigger sobre `products`; cambiar el modo de un producto con historia exige un procedimiento futuro.
- **Documentos:** `purchase_lines.lot_number` y `expiration_date` pasan a ser opcionales. La línea conserva lo que se recibió, según el modo.
- **Migración de datos:**
  - los productos con `requires_lot_control = true` pasan a `LOT_EXPIRY`;
  - los antiguos con `false` pasan a `SIMPLE` si nunca tuvieron existencias, o a `LOT_EXPIRY` si las tienen, porque sus lotes ya tienen número y vencimiento.

  Después se elimina `requires_lot_control`.

### Reglas de salida

- Una única consulta de candidatos para todos los modos: existencias activas, con saldo y sin vencer (`expiration_date IS NULL OR expiration_date >= día`), ordenadas por `expiration_date ASC NULLS LAST, created_at ASC`.
  - Si hay vencimiento, la salida es FEFO; si no, va por orden de entrada.
  - Se mantiene `FOR UPDATE` al confirmar.
- **`SERIAL`:**
  - la confirmación y la vista previa reciben `serialNumbers` por línea, y su cantidad debe ser igual a las unidades base de la línea;
  - el sistema bloquea esas existencias y rechaza series inexistentes, repetidas o sin saldo;
  - la vista previa devuelve las series disponibles para elegir.
- **`SERVICE`:** la línea de venta no tiene asignaciones, kardex ni salida del submayor; su costo es 0. Una nota crédito sobre esa línea devuelve dinero sin reingresar inventario.
- **Valoración:** el submayor de costos (F2) no cambia; sigue siendo por producto.

### Entradas

- **Recepción de compra:** valida lote y vencimiento contra el modo real del producto, sin confiar en el formulario.
  - `SIMPLE` acumula en el saldo de la ubicación.
  - `SERIAL` recibe `serialNumbers`, solo con presentaciones de factor 1, y crea una línea de compra por serie.
  - `SERVICE` se rechaza: las compras de servicios van por egresos.
- **Lote manual y ajustes:** siguen el mismo esquema. Un ajuste que deje una serie en más de 1 unidad se rechaza.

### Perfil sectorial

- El perfil vive en `packages/contracts` como regla del producto, no del negocio: modo por defecto, modos permitidos y modo exigido a los productos con fórmula médica.
- Perfil **farmacia**:
  - modo por defecto `LOT_EXPIRY`;
  - permite todos los modos;
  - un producto con `prescriptionRequired` debe ser `LOT_EXPIRY`, porque FEFO es obligatorio para medicamentos según `AGENTS.md`.
- Sin empresa configurada rige el perfil farmacia.
- `GET /products/settings` entrega el perfil vigente al formulario de producto, con el permiso de lectura del catálogo.

### Web

- **Catálogo:** selector de "Control de inventario", con el modo por defecto del perfil y la explicación de cada modo; filtro y columna por modo en el listado.
- **Recepción de compra:** lote, vencimiento o series según el modo del producto; los servicios no se ofrecen.
- **Existencias:** alta manual según el modo; las pantallas muestran "Sin lote" y "No vence".
- **POS:**
  - los servicios se venden sin existencia;
  - una línea por serie no se cobra hasta elegir una serie por unidad, de las que devuelve la vista previa;
  - el carrito indica si la salida es FEFO, por orden de entrada o por serie.

### Alertas y reportes

Las alertas de vencimiento, el reporte de vencimientos y el de devolución a proveedor por vencimiento solo consideran existencias con vencimiento. Las pantallas muestran "Sin lote" y "No vence" cuando corresponde.

## Implementación de F5 (costeo configurable)

Decisión de arquitectura del orquestador (2026-10-25), implementada el mismo día. El método de costeo lo elige cada empresa en su política contable (F3); FEFO y el orden físico siguen siendo independientes del método.

### Métodos

| Método             | Costo de una salida                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `WEIGHTED_AVERAGE` | Promedio ponderado móvil del producto (F2, sin cambios; valor por defecto)               |
| `FIFO` (PEPS)      | Capas de costo del producto en orden de entrada, sin importar de qué existencia salió   |
| `SPECIFIC_LOT`     | Capas de la misma existencia física de la que salió (lote, serie o saldo simple)          |

### Modelo

- **`inventory_cost_layers`**: una capa por entrada y por existencia, con su cantidad y su valor inicial y remanente, en centavos exactos.
  - Una salida que consume parte de una capa toma su parte proporcional con redondeo half-up; la que vacía la capa se lleva el valor remanente. Así la suma de las salidas siempre coincide con lo que entró.
  - Con el promedio no se mantienen capas: al convertir hacia PEPS o costo identificado se reconstruyen desde las existencias.
- **`inventory_cost_balances`** sigue siendo el total valorizado por producto en los tres métodos, y guarda con qué método está valorizado (`costing_method`).
- **El submayor recibe en cada movimiento el reparto por existencia** (`lots`). Todos los llamadores lo conocen: compra, venta, anulación, notas crédito y débito, ajustes y existencia manual.
- **Entradas con valor conocido** (compra, devolución al costo de salida): se reparten entre sus existencias.
  - **Entradas sin documento** (ajuste, existencia manual):
    - con promedio y PEPS, se valoran al promedio del producto;
    - con costo identificado, al promedio de las capas de esa existencia, o al del producto si la existencia no tiene capas;
    - si no hay existencias, al último costo conocido.
- **Apertura:** un producto que se mueve por primera vez abre sus capas por existencia, con las cantidades previas al movimiento y el costo de apertura de la política.

### Cambio de método

- **Cuándo:** una versión de política con otro método solo puede regir desde el **primer día de un mes futuro**. El período en curso cierra con el método anterior.
- **Conversión por producto**, perezosa y atómica: la ejecuta el primer movimiento del producto bajo el método nuevo, con su saldo bloqueado.
  - Hacia el promedio, se cierran las capas abiertas.
  - Hacia PEPS o costo identificado, se reconstruyen las capas por existencia, valoradas al costo promedio vigente del producto. El último tramo se lleva el residuo.
  - **El valor total del inventario no cambia**, así que no hay asiento de revaluación.
- **Constancia:** cada conversión queda en `inventory_costing_conversions` (solo inserción): producto, método anterior y nuevo, cantidad, valor y política. Los movimientos pasados no se recalculan.
- **Web:** la pantalla de política contable ofrece los tres métodos, explica el cambio y valida la fecha antes de enviar.

## Pendientes

- Revisar los requerimientos multisector (POS, inventario y catálogo), que hoy solo están descritos para farmacia.
