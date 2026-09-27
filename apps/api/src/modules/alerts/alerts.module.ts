import { Module } from '@nestjs/common';
import { AlertsService } from './application/alerts.service';
import { AlertsController } from './presentation/alerts.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
