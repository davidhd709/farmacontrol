# Reunión del 4 de octubre de 2026

**Fecha y hora:** 4 de octubre de 2026, 18:15 GMT-05:00

## Resumen

Revisión contable y configuración de módulos con definición de cuentas y reportes financieros.

### Rangos y estados financieros

Definición de rangos para cartera y validación de generación automática de estados financieros.

### Estructura del PUC

Carga completa del Plan Único de Cuentas y unificación del módulo de terceros.

### Cierres y controles contables

Establecimiento de cierres contables anuales y bloqueo de documentos para control mensual.

## Decisiones

- **Definición de rangos de cartera por edades:** Se estableció que la cartera por edades se clasifique en intervalos de 0 a 30, 31 a 60, 61 a 90 y más de 90 días, considerándose esta última como cartera crítica.
- **Carga completa del Plan Único de Cuentas:** Se acordó subir todas las cuentas del Plan Único de Cuentas (PUC) al sistema para que estén disponibles ante cualquier eventualidad.
- **Unificación del módulo de gestión de terceros:** Se acordó centralizar la creación y gestión de todos los terceros, incluyendo clientes, proveedores y empleados, en un módulo unificado.
- **Apartados independientes para recibos y egresos:** Se acordó estructurar apartados independientes en el sistema para los recibos de caja y los comprobantes de egreso.
- **Controles separados de caja y banco:** Se estableció implementar un control de caja y un control de banco con campos específicos para débitos, créditos y saldos.

## Próximos pasos

- **THONY SOTO — Enviar PUC:** Compartir el archivo del Plan Único de Cuentas con Henry a través de WhatsApp.
- **Henry David Tordecilla López — Ajustar reportes:** Incluir las columnas de débito, crédito y saldo en los reportes de bancos y caja del sistema.
- **Henry David Tordecilla López — Renombrar módulo:** Cambiar la etiqueta del módulo de gastos operativos por causación de gastos.
- **Henry David Tordecilla López — Corregir plantilla PUC:** Ajustar la estructura de la plantilla de importación del Plan Único de Cuentas según el archivo de referencia.
- **Henry David Tordecilla López — Modificar módulo de terceros:** Integrar la gestión de proveedores, clientes y empleados dentro del módulo de terceros. Implementar la funcionalidad para crear nuevos terceros incluyendo todos sus datos.
- **Henry David Tordecilla López — Crear módulos de documentos:** Desarrollar secciones independientes para registrar comprobantes de egreso y recibos de caja. Vincular estos documentos con los auxiliares de caja y banco.
- **Henry David Tordecilla López — Implementar control de bancos:** Crear el módulo para el control de bancos. Incluir los campos de débito, crédito y saldo para el seguimiento financiero.
- **Henry David Tordecilla López — Actualizar control de caja:** Añadir los campos de débito, crédito y saldo al control de caja. Asegurar que los débitos sean positivos y los créditos negativos.
- **Henry David Tordecilla López — Desarrollar bloqueo de periodos:** Implementar una función de bloqueo de documentos para evitar registros contables en periodos cerrados. Habilitar la restricción por fecha para proteger la integridad de la información histórica.

## Detalles

### Edades de cuentas por cobrar

Henry David Tordecilla López y THONY SOTO establecieron los rangos para la cartera de cuentas por cobrar, definiendo los intervalos de 0 a 30 días, de 31 a 60 días, de 61 a 90 días, y más de 90 días para identificar carteras críticas.

**Marca de tiempo:** 00:00:00

### Funcionalidad de recordatorios de pago

Henry David Tordecilla López propuso implementar una funcionalidad futura para enviar recordatorios automáticos o manuales a clientes con saldos pendientes, acordando con THONY SOTO dejarla de forma manual mediante un botón para evaluar el comportamiento individual de pago de cada cliente.

**Marca de tiempo:** 00:01:26

### Generación automática de estados financieros

Henry David Tordecilla López detalló la creación automática de información financiera que incluye el estado de situación financiera, estado de resultados, balance de comprobación, auxiliares y reportes administrativos complementarios, validando que el activo sea igual a la suma del pasivo más el patrimonio.

**Marca de tiempo:** 00:03:03

### Estructura del estado de resultados

Henry David Tordecilla López presentó un ejemplo numérico del estado de resultados con ventas brutas de 30 millones, descuentos de 500,000, ventas netas de 29.5 millones, costo de mercancía vendida de 18 millones, utilidad bruta de 11.5 millones, gastos de 1.5 millones y una utilidad del periodo de 8.9 millones.

**Marca de tiempo:** 00:04:50

### Auxiliares contables y filtrado de cuentas

THONY SOTO indicó que el sistema debe permitir generar auxiliares para cualquier cuenta contable utilizada, tales como los servicios de energía u otras cuentas de gastos, mostrando saldo inicial, débitos, créditos y saldo final.

**Marca de tiempo:** 00:07:42

### Reportes complementarios y productos próximos a vencer

THONY SOTO confirmó que los productos próximos a vencer para devoluciones con proveedores se manejan universalmente a 3 meses (90 días), acordando notificar al proveedor entre 110 y 120 días antes para el retiro de la mercancía.

**Marca de tiempo:** 00:11:38

### Plan Único de Cuentas y partida doble

THONY SOTO explicó que el Plan Único de Cuentas (PUC) debe cargarse completo con todas las cuentas disponibles, incluyendo las de poco uso como ingresos recibidos para terceros aplicados en situaciones como Malibu, recordando además el principio fundamental de partida doble.

**Marca de tiempo:** 00:15:14

### Naturaleza y tratamiento de cuentas en el sistema

THONY SOTO detalló la naturaleza de las cuentas, indicando que activos, costos y gastos aumentan por el débito, mientras que pasivos, patrimonio e ingresos aumentan por el crédito, señalando que la cuenta de descuentos (4175) es de naturaleza débito y que las partidas invertidas deben mostrar saldos negativos.

**Marca de tiempo:** 00:24:05

### Importación del Plan Único de Cuentas

Henry David Tordecilla López importó el archivo del PUC enviado por THONY SOTO a través de WhatsApp y revisó las columnas requeridas, incluyendo código, nombre, subcuenta como cuenta padre y tipo de cuenta, utilizando un entorno de Linux.

**Marca de tiempo:** 00:31:29

### Ajustes en los módulos de tesorería y cuentas bancarias

THONY SOTO aclaró que la creación de cuentas bancarias y gastos operativos debe realizarse directamente a través del Plan Único de Cuentas en lugar de formularios independientes, y que los controles de caja y bancos deben incorporar columnas obligatorias de débitos, créditos y saldos.

**Marca de tiempo:** 00:46:20

### Causación de gastos y filtros en reportes financieros

Henry David Tordecilla López modificó el módulo de gastos operativos a "causación de gastos" y revisó las opciones de filtrado rápido por fecha (hoy, este mes, mes anterior, año a la fecha) y rangos personalizados para el balance de comprobación, estado de resultados y balance general.

**Marca de tiempo:** 00:51:34

### Unificación del módulo de terceros

THONY SOTO indicó que la creación de clientes, proveedores y empleados debe centralizarse en el módulo de terceros, recomendando eliminar listados separados de clientes o proveedores para reemplazarlos por reportes específicos de cartera y cuentas por pagar.

**Marca de tiempo:** 00:55:23

### Cierres contables anuales y cancelación de cuentas

THONY SOTO explicó que los cierres anuales se realizan a fin de año para cancelar todas las cuentas y movimientos, logrando que la cuenta de resultados ordinarios quede vacía para el nuevo año. También detalló que en sistemas como Wofice se utiliza un documento de nota contable interno para trasladar las cuentas de resultado a resultados de ejercicios anteriores y las pérdidas a pérdidas de ejercicios anteriores a corte del 31 de diciembre de 2025. Henry David Tordecilla López y THONY SOTO conversaron sobre cómo esto permite iniciar con los movimientos en cero mientras se conserva la información histórica y los balances del año anterior mediante parámetros automatizados del sistema.

**Marca de tiempo:** 00:59:46 / 01:01:12 / 01:02:30

### Cronograma de cierre de periodo y ajustes manuales de fecha

Henry David Tordecilla López y THONY SOTO aclararon que el cierre del periodo requiere parámetros manuales y la fecha del 31 de diciembre, pero en la práctica el cierre se efectúa en febrero debido a que la contabilidad nunca está al día el último día del año. THONY SOTO indicó que se requiere tiempo para revisar facturas, cruzar anticipos y cuadrar bancos. También explicó que al registrar transacciones de meses pasados en enero o febrero, las fechas deben modificarse de forma manual porque el sistema asigna automáticamente la fecha del día en curso.

**Marca de tiempo:** 01:03:23 / 01:04:09

### Bloqueo de documentos y controles mensuales

THONY SOTO explicó que, una vez revisado y cuadrado todo, se aplica un bloqueo de documentos para impedir que se realicen registros con esa fecha, generando una restricción en el sistema. Agregó que este bloqueo también se puede aplicar de manera mensual —como se hizo en el informe a corte de julio— para evitar alteraciones en los gastos, obligando a registrar compras pendientes en el periodo siguiente. THONY SOTO enfatizó que el cierre de periodo contable y el bloqueo de documentos corresponden a funciones distintas.

**Marca de tiempo:** 01:05:19

### Recibos de caja y comprobantes de egreso en el módulo contable

THONY SOTO señaló que los auxiliares de caja y bancos deben alimentarse de documentos específicos: recibos de caja para el ingreso de dinero y comprobantes de egreso para las salidas, como el pago de energía. Henry David Tordecilla López y THONY SOTO coincidieron en que por cada venta debe existir obligatoriamente una factura de venta y un recibo de caja. THONY SOTO indicó que estos son documentos independientes relacionados con el efectivo, distintos del reconocimiento de gastos por causación, y Henry David Tordecilla López confirmó que agregará apartados independientes en el sistema.

**Marca de tiempo:** 01:06:30 / 01:07:33

### Configuraciones de control de caja y bancos

THONY SOTO recordó a Henry David Tordecilla López incluir las columnas de débito, crédito y saldo en el control de caja, especificando que los débitos son positivos y los créditos negativos, además de solicitar la creación de un control de bancos bajo la misma estructura. Henry David Tordecilla López confirmó que continuará trabajando en estas actualizaciones durante la semana.

**Marca de tiempo:** 01:10:05
