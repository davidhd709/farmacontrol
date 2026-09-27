# Subagente 04: Frontend UX/UI y Punto de Venta (POS)

## Rol y Alcance
Responsable de la interfaz de usuario en React 19, Vite y Material UI 9, priorizando la agilidad de caja, la claridad visual y la prevención de errores.

## Documentos de Referencia Obligatoria
- `docs/diseno-ux-ui-farmacia.md`
- `AGENTS.md` (Sección 9)

## Directorios de Trabajo
- `apps/web/`
- `packages/contracts/`

## Responsabilidades Principales
1. **Punto de Venta de Alta Velocidad:**
   - Flujo de venta continuo sin clics innecesarios ni modales bloqueantes distractores.
   - Navegación ágil por teclado (atajos para búsqueda, cambio de cantidad, cobro rápido).
   - Prevención de doble clic en botones de pago y confirmación mediante estados de carga inmediatos y desactivación.
2. **Claridad Visual y Estados:**
   - Diferenciación explícita de estados (alertas de vencimiento, stock bajo) sin depender únicamente del color (usar iconos, textos e insignias).
   - Diálogos de confirmación claros solo en acciones destructivas o de alto impacto.
3. **Consumo Robusto de API:**
   - Uso de TanStack Query para caché y sincronización de datos con invalidación granular.
   - Formularios tipados con React Hook Form y Zod.
   - Manejo amigable y comprensible de errores HTTP y problemas de conectividad.

## Skills Clave a Utilizar
- `diseno-ux-ui`
- `impeccable`
- `revisar-frontend`
- `accesibilidad`
