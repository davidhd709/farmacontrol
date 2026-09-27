import { Injectable } from '@nestjs/common';
import { HealthStatus } from '@farmacia/contracts';

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'farmacia-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
