import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ExpirationEvaluatorService } from './services/expiration-evaluator.service';
import { JobQueueService } from './services/job-queue.service';
import { ExpirationCronScheduler } from './schedulers/expiration-cron.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [],
  providers: [
    ExpirationEvaluatorService,
    JobQueueService,
    ExpirationCronScheduler,
  ],
  exports: [ExpirationEvaluatorService, JobQueueService],
})
export class WorkerModule {}
