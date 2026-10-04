import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getCorsConfig } from './common/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global de API según arquitectura
  app.setGlobalPrefix('api/v1');

  // Habilitar política de CORS endurecida con lista blanca
  app.enableCors(getCorsConfig());

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`[FarmaControl API] corriendo en http://localhost:${port}/api/v1`);
}

bootstrap();
