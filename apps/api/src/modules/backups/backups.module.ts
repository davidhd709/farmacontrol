import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { BackupsService } from './application/backups.service';
import { BackupsController } from './presentation/backups.controller';

@Module({
  imports: [IdentityModule],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
