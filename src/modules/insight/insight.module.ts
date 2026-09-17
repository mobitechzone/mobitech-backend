import { Module } from '@nestjs/common';
import { InsightController } from './insight.controller';
import { InsightService } from './insight.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [InsightController],
  providers: [InsightService],
})
export class InsightModule {}
