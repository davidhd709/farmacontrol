import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  console.log('[Farmacia Worker] Inicializando proceso de tareas asíncronas...');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log('[Farmacia Worker] Worker activo y a la espera de trabajos.');
}

bootstrap();
