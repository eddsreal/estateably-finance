import { Controller, Get, Query } from '@nestjs/common';
import { MonthlyReportQueryDto } from '../dtos/monthly-report-query.dto';
import { MonthlyReportResponseDto } from '../dtos/monthly-report-response.dto';
import { SimilarReportQueryDto } from '../dtos/similar-report-query.dto';
import { SimilarReportResponseDto } from '../dtos/similar-report-response.dto';
import { ReportsService } from '../services/reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monthly')
  async monthly(@Query() query: MonthlyReportQueryDto): Promise<MonthlyReportResponseDto> {
    return MonthlyReportResponseDto.from(await this.reports.monthly(query.month));
  }

  @Get('similar')
  async similar(@Query() query: SimilarReportQueryDto): Promise<SimilarReportResponseDto> {
    return SimilarReportResponseDto.from(await this.reports.similar(query.from, query.to));
  }
}
