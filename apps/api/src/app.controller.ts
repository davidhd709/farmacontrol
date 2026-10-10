import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthStatus } from '@farmacia/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  async getHealth(): Promise<HealthStatus> {
    const health = await this.appService.getHealth();
    if (health.status !== 'ok') {
      // 503 para que el healthcheck de Docker y Caddy dejen de enviar tráfico
      throw new ServiceUnavailableException({
        message: 'La base de datos no responde.',
        details: health,
      });
    }
    return health;
  }
}
