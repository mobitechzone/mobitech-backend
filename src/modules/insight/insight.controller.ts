import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { InsightService } from './insight.service';

@ApiTags('Insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightController {
  constructor(private readonly insightService: InsightService) {}

  @Get('overview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get dashboard overview KPIs' })
  overview() {
    return this.insightService.getOverview();
  }

  @Get('sales-heatmap')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get sales heatmap data (day x hour)' })
  salesHeatmap() {
    return this.insightService.getSalesHeatmap();
  }

  @Get('repair-heatmap')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get repair activity heatmap data' })
  repairHeatmap() {
    return this.insightService.getRepairHeatmap();
  }

  @Get('sales-trend')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get sales trend for last N days' })
  salesTrend(@Query('days') days?: string) {
    return this.insightService.getSalesTrend(days ? parseInt(days) : 30);
  }

  @Get('repair-trend')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get repair trend for last N days' })
  repairTrend(@Query('days') days?: string) {
    return this.insightService.getRepairTrend(days ? parseInt(days) : 30);
  }

  @Get('top-customers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get top customers by spending' })
  topCustomers(@Query('limit') limit?: string) {
    return this.insightService.getTopCustomers(limit ? parseInt(limit) : 10);
  }

  @Get('category-breakdown')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get product category breakdown' })
  categoryBreakdown() {
    return this.insightService.getCategoryBreakdown();
  }

  @Get('payment-breakdown')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get payment method breakdown' })
  paymentBreakdown() {
    return this.insightService.getPaymentMethodBreakdown();
  }

  @Get('repair-status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get repair status breakdown' })
  repairStatus() {
    return this.insightService.getRepairStatusBreakdown();
  }

  @Get('anomalies')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get anomalies and alerts' })
  anomalies() {
    return this.insightService.getAnomalies();
  }

  @Get('daily-comparison')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get today vs yesterday comparison' })
  dailyComparison() {
    return this.insightService.getDailyRevenueComparison();
  }

  @Get('transaction-stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get transaction count, AOV, sales growth' })
  transactionStats() {
    return this.insightService.getTransactionStats();
  }

  @Get('advanced-analytics')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get full statistical analytics' })
  advancedAnalytics() {
    return this.insightService.getAdvancedAnalytics();
  }
}
