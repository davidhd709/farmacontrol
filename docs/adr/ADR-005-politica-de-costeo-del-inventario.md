# ADR-005: Política de costeo del inventario y del costo de ventas

- **Estado:** Aprobado
- **Fecha:** 2026-10-25
- **Origen:** decisión explícita del propietario, que responde las preguntas 1, 2 y 4 sobre costos del cuestionario para la contadora (`docs/PREGUNTAS_CONTADORA.md`, que llega a `main` con el PR #15) y cierra la decisión 2 de la [línea base F0](../F0_linea_base_arquitectura_hibrida.md#9-decisiones-contables-y-de-producto-pendientes).
- **Alcance:** método de valoración, apertura y devoluciones de clientes. No define impuestos (F3), ámbito multiempresa (F4) ni el asiento de los ajustes de inventario sin handler (F6).

## Contexto

La venta y la valorización del inventario usan hoy `Product.baseCost`. Las compras no actualizan ese costo, y `InventoryLot` no guarda el costo de adquisición. Las líneas de venta antiguas pueden tener `unitCostBase` nulo. El plan de desarrollo describía un inventario valorizado "al costo promedio", y el plan híbrido proponía el promedio ponderado móvil, pero lo dejaba sujeto a confirmación contable (AUD-CT-002 y AUD-CT-008). F0 prohibió iniciar F2 sin esa aprobación.

FEFO decide qué lote sale físicamente y debe seguir así por razones sanitarias. El principio 4 del [plan híbrido](../FarmaControl_Arquitectura_Hibrida_Plan_Implementacion.md#2-principios-que-no-se-negocian) separa esa salida física de la valoración contable.

## Decisión

1. **Método:** promedio ponderado móvil por producto, en unidad base.
   - Cada entrada valorizada recalcula el costo promedio: compra recibida, apertura, ajuste positivo aprobado o devolución.
   - Cada salida se valora al promedio vigente en el momento de la operación.
2. **FEFO y valoración son independientes.** FEFO sigue asignando lotes; el lote no define el costo de la salida.
3. **Costo histórico inmutable.** Cada movimiento de valoración conserva cantidad, costo unitario aplicado, valor y documento de origen. El costo de ventas sale de ese registro, no de `Product.baseCost`. Cambiar la configuración o el catálogo no altera los costos ya aplicados.
4. **Apertura:** el inventario existente se valoriza con el **último costo de compra** registrado de cada producto. Si un producto no tiene compras, se usa `Product.baseCost`.
   - La apertura se registra desde una **fecha de corte** y no recalcula ejercicios anteriores.
   - Las diferencias que no se puedan reconstruir se documentan en lugar de imputarse.
5. **Devoluciones de clientes** (notas crédito con reingreso): la mercancía vuelve **al costo con que salió** en la venta original. Así se revierte exactamente el costo de venta registrado y se conserva la trazabilidad con el documento de origen.

## Alternativas consideradas

| Alternativa                                                            | Resultado                                                                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Costo identificado por lote                                            | Descartada: exige costo en cada lote y complica bonificaciones, ajustes y los lotes existentes sin costo.                                            |
| PEPS                                                                   | Descartada: agrega una segunda capa de orden de salida además de FEFO, sin beneficio para el cliente.                                                |
| Mantener `Product.baseCost`                                            | Descartada: es la causa de AUD-CT-002.                                                                                                               |
| Apertura al costo del catálogo o a un costo entregado por la contadora | No seleccionadas. La contadora puede reemplazar la apertura con un archivo aprobado antes de la carga real, mediante el mismo mecanismo de apertura. |
| Devolución al promedio vigente                                         | Descartada: deja una diferencia frente al costo de salida y rompe la simetría del costo de ventas.                                                   |

## Consecuencias

- **F2:**
  - agrega el submayor de valoración;
  - toma el costo de cada compra recibida;
  - calcula el promedio por producto;
  - valora las salidas de venta y la reversión de las devoluciones;
  - prueba la conciliación `existencias iniciales + entradas − salidas ± ajustes = existencias finales` en unidades y en valor.
- Las migraciones son aditivas y no reescriben históricos protegidos por triggers.
- Una salida sin costo determinable, por ejemplo un producto sin costo de apertura, debe rechazarse con un error controlado, como ya exige ADR-004 para el asiento obligatorio. No se asume costo cero.
- Los ajustes de inventario usan el promedio vigente; su asiento contable corresponde a F6.
- Las devoluciones a proveedor (notas débito) salen al promedio vigente. Si eso genera una diferencia frente al costo de compra, su tratamiento se define en F2 con evidencia de pruebas, antes de implementarlo.

## Pendientes

- **Fecha de corte de la apertura:** la definen el cliente y la contadora antes de la carga real. F2 la recibe como parámetro.
- **Validación de la contadora:** si cambia el método, se requiere una nueva ADR y una migración controlada. No se recalculan en silencio los costos ya aplicados.
