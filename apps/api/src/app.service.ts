import { Injectable, Logger, OnApplicationShutdown, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { HealthStatus } from '@farmacia/contracts';

const DATABASE_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class AppService implements OnApplicationShutdown {
  private readonly logger = new Logger(AppService.name);
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async getHealth(): Promise<HealthStatus> {
    const database = (await this.isDatabaseReachable()) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'error',
      service: 'farmacia-api',
      database,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }

  private async isDatabaseReachable(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Sin respuesta en ${DATABASE_CHECK_TIMEOUT_MS} ms`)),
        DATABASE_CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.client.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch (error) {
      // El detalle va al log; la respuesta pública solo dice que la base no responde
      this.logger.error(`Health check: la base de datos no responde: ${(error as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
