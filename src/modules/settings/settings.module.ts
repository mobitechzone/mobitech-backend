import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  controllers: [SettingsController, BackupController],
  providers: [SettingsService, BackupService],
  exports: [SettingsService, BackupService],
})
export class SettingsModule {}
