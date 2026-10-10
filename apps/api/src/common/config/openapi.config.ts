import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Publica el contrato HTTP sólo cuando la configuración del entorno lo permite. */
export function configureOpenApi(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production' && process.env.API_DOCS_ENABLED !== 'true') return;

  const config = new DocumentBuilder()
    .setTitle('FarmaControl API')
    .setVersion('1.0')
    .addCookieAuth('sid', { type: 'apiKey', in: 'cookie', name: 'sid' }, 'sid')
    .addSecurityRequirements('sid')
    .build();

  SwaggerModule.setup(
    'api/v1/docs',
    app,
    () => {
      const document = SwaggerModule.createDocument(app, config);
      const tags = new Set<string>();
      for (const [path, methods] of Object.entries(document.paths)) {
        const tag = path.replace(/^\/api\/v1\/?/, '').split('/')[0] || 'root';
        tags.add(tag);
        for (const operation of Object.values(methods ?? {})) {
          if (operation && typeof operation === 'object' && 'responses' in operation) {
            operation.tags = [tag];
          }
        }
      }
      document.tags = [...tags].sort().map((name) => ({ name }));
      return document;
    },
    { jsonDocumentUrl: 'api/v1/docs-json' },
  );
}
