# Rediseño FarmaControl — Fase 1: navegación, inicio y diseño común

**Fecha:** 2026-11-12 · **Base:** `main` en `554a474` · **Estado:** IMPLEMENTADO

## 1. Qué cambió

### Navegación (`apps/web/src/app/navigation.tsx`, `components/layout/AppSidebar.tsx`)

- El menú pasa de 9 categorías planas con 37 accesos a **Inicio + 8 grupos plegables**: Ventas, Compras, Inventario, Terceros, Tesorería, Contabilidad, Reportes y Configuración (la tabla de la fase 0, sección 2.2, indica el grupo de cada ruta).
- **No cambió ninguna `path` ni ningún permiso.** El menú y la guarda de rutas (`RequirePermission`) siguen leyendo la misma tabla. `/customers`, `/suppliers` y `/accounting/lookup` siguen funcionando.
- El grupo de la pantalla actual se abre solo, también al entrar por URL directa. Se reconoce por el texto en negrita y una barra lateral, no solo por el color. La entrada activa lleva `aria-current="page"`.
- Las entradas ahora son enlaces reales (`<a href>`): se navegan con Tab y Enter, se abren en otra pestaña y conservan la URL. Los encabezados de grupo son botones con `aria-expanded` y `aria-controls`.
- Los grupos que el usuario abre o cierra se recuerdan en `localStorage`. Si el almacenamiento falla, el menú funciona igual. Sin preferencia guardada:
  - con 8 accesos o menos se abren todos los grupos;
  - con más, se abre el primer grupo del perfil (Ventas para caja) más el grupo activo.
- En ventanas pequeñas el menú es temporal, empieza debajo de la barra superior y se cierra al navegar.
- `menuGroupForPath()` es nuevo: devuelve el grupo de una ruta, incluidas las rutas hijas como `/sales/:id`.

### Barra superior (`components/layout/AppNavbar.tsx`)

- **Nueva venta** se muestra solo con `sales:create`. **Alertas** se muestra solo con `inventory:read` + `alerts:read`, y la consulta de alertas ya no corre sin permiso (antes un cajero recibía un 403 cada 30 s). El conteo de vencidos y críticos se anuncia como texto.
- **Cambiar contraseña** y **Cerrar sesión** pasan al menú del usuario (avatar, nombre y rol).
- La marca es un enlace a Inicio que se alcanza con el teclado.

### Señal de ambiente

- API: `GET /api/v1/health` devuelve `environment`, tomado de la variable `APP_ENVIRONMENT` (`produccion` | `pruebas` | `desarrollo`). Un valor ausente o desconocido devuelve `null` (`resolveAppEnvironment` en `apps/api/src/app.service.ts`). El contrato está en `HealthStatus.environment` y `AppEnvironment` (`packages/contracts`).
- Web: `useAppEnvironment()` lo consulta una vez. La barra superior y el ingreso muestran «Pruebas» o «Desarrollo» y el pie del menú muestra el ambiente. **Se eliminó el «Producción» fijo**: sin la variable no se muestra ninguna etiqueta.
- Infraestructura: `APP_ENVIRONMENT` se declara en `infra/compose/docker-compose.production.yml`, en `.env.example` y en el runbook de UAT (`docs/runbooks/uat-ambiente.md`).

### Inicio (`pages/AuthenticatedHomePage.tsx`)

- Se retiró la franja de saludo con el conteo de permisos y los chips de rol, y el panel de «Avisos operativos y reglas críticas» (texto técnico de FEFO).
- **Accesos frecuentes** según el perfil: Nueva venta, Recibir compra, Stock y lotes, Caja e Historial de ventas.
- **Indicadores compactos** según el permiso: Ventas de hoy, Efectivo en caja, Vencimientos, Bancos y Cartera. Cada uno tiene su error con reintento y su enlace a la pantalla donde se actúa.
- **Pendientes** que llevan a una acción: lotes vencidos, lotes críticos y cartera con más de 60 días, cada uno con su botón. Si no hay ninguno, se dice.

### Diseño común

- `theme/app-theme.ts`: encabezado de tabla sobrio, cifras con ancho fijo (`tabular-nums`) y estilos comunes de chips, títulos y acciones de diálogo, alertas y tarjetas. Además, foco visible del color de marca en todo control.
- `components/StatusChip.tsx`: el estado siempre lleva texto e icono, y el color acompaña.
- `utils/money.ts › formatCop()`: formatea importes del API en unidades mayores pasando a centavos, sin aritmética binaria. Es el formato único COP que usan Inicio, Detalle de venta e Historial.
- `features/sales/sale-labels.ts`: estados y medios de pago en español. El historial mostraba `EFECTIVO` y `TARJETA_DEBITO` crudos.

### Ingreso (`features/auth/pages/LoginPage.tsx`)

Usa la misma marca que la barra superior, con el formulario más compacto (400 px) y la señal de ambiente. El botón de mostrar contraseña anuncia su estado (`aria-pressed`). Las etiquetas, el foco inicial y los errores accesibles ya estaban bien y se conservaron.

### Muestras del nuevo diseño

- **Detalle de venta (nuevo, `/sales/:id`, `features/sales/pages/SaleDetailPage.tsx`).** Muestra datos, totales y líneas con presentación, factor histórico y lotes con vencimiento, además de las devoluciones con lo devuelto por línea. Las acciones dependen del estado y del permiso (Comprobante, Devolución, Historial, Anular). Si no se puede anular, la pantalla dice por qué («Tiene una nota crédito vigente: anúlela antes…»), con la misma regla que aplica el API (409, AUD-002). Si la venta no carga, ofrece reintentar y volver al historial. El número de comprobante del historial lleva al detalle.
- `features/sales/components/CancelSaleDialog.tsx`: anulación compartida por el historial y el detalle. Exige motivo, muestra el efecto, bloquea el doble envío y conserva el motivo si el servidor rechaza la anulación.
- **POS:** solo cambia el encabezado al estilo común («Punto de venta», con la pista de F2). La carga del cliente y el carrito son de la fase 2.

## 2. Archivos principales

| Área | Archivos |
|---|---|
| Navegación y shell | `apps/web/src/app/navigation.tsx`, `app/useAppEnvironment.ts`, `components/layout/AppSidebar.tsx`, `AppNavbar.tsx`, `AppLayout.tsx` |
| Inicio | `apps/web/src/pages/AuthenticatedHomePage.tsx` |
| Ventas | `features/sales/pages/SaleDetailPage.tsx` (nuevo), `SalesHistoryPage.tsx`, `PosPage.tsx`, `components/CancelSaleDialog.tsx` (nuevo), `sale-labels.ts` (nuevo) |
| Común | `theme/app-theme.ts`, `components/StatusChip.tsx` (nuevo), `utils/money.ts`, `App.tsx` (ruta `/sales/:id`) |
| Ingreso | `features/auth/pages/LoginPage.tsx` |
| API y contrato | `apps/api/src/app.service.ts`, `packages/contracts/src/index.ts` |
| Infraestructura y docs | `infra/compose/docker-compose.production.yml`, `.env.example`, `docs/runbooks/uat-ambiente.md` |
| Pruebas nuevas | `apps/web/test/app-shell.test.tsx`, `apps/web/test/sale-detail.test.tsx`, `apps/api/test/unit/app-environment.spec.ts`, `tests/e2e/specs/redesign-phase1.spec.ts`, casos nuevos en `dashboard.test.tsx` y `money.test.ts` |
| Pruebas ajustadas a los textos nuevos | `auth-flow`, `dashboard`, `permissions`, `sales-history`, `tesoreria-navigation`, `third-parties-scope`, `document-annulments` (falla previa corregida), E2E `auth` y `permissions` |

## 3. Pruebas

Ver la sección 6 (resultados reales, con lo comprobado en código separado de lo comprobado en navegador).

## 4. Decisiones

1. **El ambiente lo declara el servidor en tiempo de ejecución** y no el *build* de la web. Así la misma imagen sirve para pruebas y producción, y la etiqueta no depende del nombre de la empresa ni de `NODE_ENV`.
2. **No se crearon rutas nuevas para grupos.** El agrupamiento es solo de presentación. Las rutas, los permisos y la protección del API quedan intactos.
3. **El Detalle de venta reutiliza** el comprobante, la nota crédito, el historial de acciones y la anulación existentes. No se agregaron endpoints: usa `GET /sales/:id` y `GET /sales/:id/credit-notes`.
4. **El bloqueo de anulación con notas vigentes se muestra antes de intentar**, pero el API sigue siendo quien decide. Una venta a crédito con abonos también la rechaza el API, y ese error se muestra en el diálogo sin perder el motivo.
5. **El historial de ventas solo recibió el enlace al detalle**, las etiquetas en español y el diálogo de anulación compartido. Su rediseño completo es de la fase 2.

## 5. Pendientes

| Pendiente | Fase |
|---|---|
| «Cargando cliente…» permanente en el POS: el manejo del estado está confirmado en el código y la causa de datos es probable (fase 0, sección 5) | 2 |
| Protección del consumidor final en `CustomersLedger.setActive/update/upsert` (decisión D5) | 2 |
| **Tirilla de venta con dirección y nombre fijos** (`SaleReceiptDialog.tsx:142-151`). Debe usar `useCompanyInfo` como las demás plantillas | 2 (POS) / 4 (impresión) |
| Corrección de recibos y egresos no atómica y hooks después de un `return` en `TreasuryDocumentCorrectionDialog` (fase 0, sección 4.2; decisión D1) | 4 |
| Motivo y enlace al origen cuando un egreso `AUTOMATICO` no permite corrección | 4 |
| `DebitNotePrintDialog` y `PurchasePrintDialog` sin conectar | 3 / 4 |
| Aplicar `StatusChip`, `formatCop` y el encabezado común al resto de pantallas | 2 a 5, por pantalla |
| Avisos de lint previos (web 40, api 98) | fuera de alcance; sin cambios |
| Definir `APP_ENVIRONMENT=pruebas` en el servidor de Droguería Vida Sana (decisión D4). Sin la variable no aparece etiqueta | Operación |

## 6. Resultados de verificación

### En código

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK (0 errores) |
| `pnpm --filter @farmacia/web lint` | 0 errores, 40 avisos (los mismos de la línea base) |
| `pnpm --filter @farmacia/web test` | **55 archivos, 395 pruebas, todas en verde** (línea base: 12 fallas, 1 determinista) |
| `pnpm --filter @farmacia/web build` | OK |
| `pnpm test apps/api/test/unit/app-environment.spec.ts apps/api/test/health.e2e-spec.ts` (PostgreSQL efímero) | 2 archivos, 11 pruebas en verde |

### En navegador (Playwright + Chromium, API y web reales, base efímera, `APP_ENVIRONMENT=pruebas`)

| Corrida | Resultado |
|---|---|
| `pnpm test:e2e` (suite completa) | 13 en verde, 5 omitidas (capturas responsive, solo con `RESPONSIVE_SHOTS`) y 1 falla en la prueba nueva de ventana estrecha. La causa era el selector de la prueba, no la interfaz: el cajón modal marca la página como `aria-hidden`. Se corrigió el selector |
| `pnpm test:e2e specs/redesign-phase1.spec.ts specs/permissions.spec.ts specs/auth.spec.ts` (tras los últimos ajustes) | **8 de 8 en verde** |

Qué recorre `redesign-phase1.spec.ts`:

- Inicio sin conteo de permisos, con indicadores y la etiqueta «Pruebas» en la barra y en el pie.
- `/treasury/receipts` por URL directa: el grupo Tesorería abierto y la entrada marcada.
- Teclado: Enter abre Inventario y Tab + Enter llega a Stock y lotes.
- `/customers` sigue redirigiendo.
- Menú de usuario con Cambiar contraseña y Cerrar sesión.
- A 360 px: sin desplazamiento horizontal, el menú se abre con el botón, empieza debajo de la barra y se cierra al navegar.
- Venta creada con datos de prueba → historial → detalle con lote y vencimiento, acciones visibles y recarga directa de `/sales/:id`.
- La E2E del cajero (`permissions.spec.ts`) confirma que ve «Punto de venta» sin abrir nada y que el API rechaza lo que no le corresponde.

**Hallazgos del navegador que se corrigieron en esta fase:**

1. Con más de 8 accesos (cajero) todos los grupos empezaban cerrados.
2. En ventana estrecha, el menú temporal quedaba debajo de la barra superior y tapaba «Inicio». Esto ya pasaba antes del rediseño.
3. La tabla del detalle se comprimía en lugar de desplazarse.

Capturas con datos de prueba en `docs/rediseno/fase-1/`: `inicio-1440`, `inicio-360`, `menu-agrupado-1440`, `menu-usuario-1440`, `menu-360`, `pos-1440`, `detalle-venta-1440`, `detalle-venta-360`.

**No comprobado:** el entorno de Droguería Vida Sana. No hay acceso desde esta máquina. Todo lo anterior se recorrió en el entorno efímero de las E2E.
