import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TreasuryService } from './application/treasury.service';
import { TreasuryController } from './presentation/treasury.controller';

@Module({
  imports: [IdentityModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
