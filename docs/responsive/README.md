# Revisión responsive (correcciones del cliente, 2026-11-02)

Capturas de las 41 pantallas de la aplicación en cuatro anchos: **360, 768, 1024 y 1440 px**.

| Carpeta | Contenido |
|---|---|
| `antes/<ancho>/<pantalla>.jpg` | Estado antes de esta ronda de correcciones |
| `despues/<ancho>/<pantalla>.jpg` | Estado después de la revisión |
| `despues/<ancho>/reporte.json` | Verificación automática por pantalla |

El reporte de cada ancho mide tres cosas por pantalla:

- `pageOverflowX`: píxeles de scroll horizontal de toda la página (debe ser 0);
- `buttons`: botones con el texto desbordado, cortado o con menos de 6 px de relleno;
- `clipped`: elementos más anchos que el área de contenido sin un scroll horizontal propio que los contenga (por ejemplo, una tabla recortada).

En `despues` los tres quedan vacíos en las 41 pantallas y los cuatro anchos. Antes de los cambios de diseño, el mismo detector (sin la regla de relleno mínimo) encontró problemas en 5 pantallas a 360 px, 4 a 768 px, 6 a 1024 px y 2 a 1440 px; la regla de relleno se agregó porque el botón "Consultar" de Cuentas por pagar quedaba sin relleno sin llegar a desbordarse. Las capturas `antes` se tomaron antes de ese detector y no traen reporte.

## Cómo regenerarlas

Las genera la prueba E2E `tests/e2e/specs/zz-responsive-screenshots.spec.ts`, que solo corre con la variable `RESPONSIVE_SHOTS` y va al final de la corrida para que las tablas tengan datos:

```bash
RESPONSIVE_SHOTS=despues pnpm test:e2e
```

Sin la variable, la prueba se omite y `pnpm test:e2e` corre solo las pruebas funcionales.
