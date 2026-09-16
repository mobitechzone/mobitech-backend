import { Body, Controller, Delete, Get, Post, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { Response } from 'express';
import { Param } from '@nestjs/common';
import { BackupService } from './backup.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Backup')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual database backup (admin only)' })
  create(@CurrentUser() actor: User) {
    return this.backupService.createBackup(actor, 'manual');
  }

  @Get()
  @ApiOperation({ summary: 'List all backups (admin only)' })
  list() {
    return this.backupService.listBackups();
  }

  @Get(':filename/download')
  @ApiOperation({ summary: 'Download a backup file (admin only)' })
  async download(@Param('filename') filename: string, @Res() res: Response) {
    const buffer = await this.backupService.download(filename);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post(':filename/restore')
  @ApiOperation({ summary: 'Restore the database from a backup (admin only)' })
  restore(@Param('filename') filename: string, @CurrentUser() actor: User) {
    return this.backupService.restore(filename, actor);
  }

  @Delete(':filename')
  @ApiOperation({ summary: 'Delete a backup file (admin only)' })
  remove(@Param('filename') filename: string, @CurrentUser() actor: User) {
    return this.backupService.deleteBackup(filename, actor);
  }
}
