import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { getCorsConfig } from './common/config/cors.config';
import { configureHttpApp } from './common/config/http-app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureHttpApp(app);

  // Prefijo global de API según arquitectura
  app.setGlobalPrefix('api/v1');

  // Habilitar política de CORS endurecida con lista blanca
  app.enableCors(getCorsConfig());

  // SIGTERM de Docker: cerrar conexiones y la base de datos antes de salir
  app.enableShutdownHooks();

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`[FarmaControl API] corriendo en http://localhost:${port}/api/v1`);
}

bootstrap();
