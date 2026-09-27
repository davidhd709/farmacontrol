import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global de API según arquitectura
  app.setGlobalPrefix('api/v1');

  // Habilitar CORS para desarrollo local
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`[FarmaControl API] corriendo en http://localhost:${port}/api/v1`);
}

bootstrap();
