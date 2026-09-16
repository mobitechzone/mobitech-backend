import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Today / week / month / year business overview' })
  overview() {
    return this.dashboardService.overview();
  }

  @Get('charts')
  @ApiOperation({ summary: 'Charts data: sales evolution, repairs evolution, top products, revenue vs profit' })
  charts() {
    return this.dashboardService.charts();
  }
}
