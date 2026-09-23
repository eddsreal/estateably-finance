import { Controller, Get, Query } from '@nestjs/common';
import { MonthlyReportQueryDto } from '../dtos/monthly-report-query.dto';
import { MonthlyReportResponseDto } from '../dtos/monthly-report-response.dto';
import { ReportsService } from '../services/reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monthly')
  async monthly(@Query() query: MonthlyReportQueryDto): Promise<MonthlyReportResponseDto> {
    return MonthlyReportResponseDto.from(await this.reports.monthly(query.month));
  }
}
