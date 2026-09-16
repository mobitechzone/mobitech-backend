import { Controller, Get, Param, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService, ReportQuery, ReportRange } from './reports.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly audit: AuditService,
  ) {}

  private parseQuery(type: string, range?: string, startDate?: string, endDate?: string, employeeId?: string, technicianId?: string): ReportQuery {
    return {
      type: type as ReportQuery['type'],
      range: (range as ReportRange) ?? 'month',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      employeeId,
      technicianId,
    };
  }

  @Get('export/:type')
  @ApiParam({ name: 'type', enum: ['sales', 'repairs', 'inventory', 'expenses', 'employees', 'customers', 'financial'] })
  @ApiQuery({ name: 'format', enum: ['csv', 'xlsx', 'pdf'], required: false })
  @ApiQuery({ name: 'range', enum: ['today', 'yesterday', 'week', 'month', 'year', 'custom'], required: false })
  @ApiOperation({ summary: 'Export a report as CSV, Excel or PDF' })
  async export(
    @Param('type') type: string,
    @Res() res: Response,
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Query('range') range?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('employeeId') employeeId?: string,
    @Query('technicianId') technicianId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    const query = this.parseQuery(type, range, startDate, endDate, employeeId, technicianId);
    const data = await this.reportsService.build(query);
    const fmt = format ?? 'csv';

    const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}.${fmt}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send('\uFEFF' + this.reportsService.toCsv(data));
    } else if (fmt === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(this.reportsService.toXlsxBuffer(data));
    } else if (fmt === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(await this.reportsService.toPdfBuffer(data));
    } else {
      throw new BadRequestException('Unsupported format');
    }

    await this.audit.log({
      action: 'EXPORT',
      entity: 'REPORT',
      entityId: type,
      userId: userId ?? null,
      details: { format: fmt, range: query.range },
    });
  }

  @Get(':type')
  @ApiParam({ name: 'type', enum: ['sales', 'repairs', 'inventory', 'expenses', 'employees', 'customers', 'financial'] })
  @ApiQuery({ name: 'range', enum: ['today', 'yesterday', 'week', 'month', 'year', 'custom'], required: false })
  @ApiOperation({ summary: 'Generate a report of the given type' })
  generate(
    @Param('type') type: string,
    @Query('range') range?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('employeeId') employeeId?: string,
    @Query('technicianId') technicianId?: string,
  ) {
    const query = this.parseQuery(type, range, startDate, endDate, employeeId, technicianId);
    return this.reportsService.build(query);
  }
}
