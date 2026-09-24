import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AiStatusResponseDto } from '../dtos/ai-status-response.dto';
import { NarrativeRequestDto } from '../dtos/narrative-request.dto';
import { NarrativeResponseDto } from '../dtos/narrative-response.dto';
import { AiService } from '../services/ai.service';

@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('reports/similar/narrative')
  @HttpCode(200)
  async narrative(@Body() body: NarrativeRequestDto): Promise<NarrativeResponseDto> {
    return NarrativeResponseDto.from(await this.ai.similarNarrative(body.from, body.to));
  }

  @Get('ai/status')
  getAiStatus(): AiStatusResponseDto {
    return AiStatusResponseDto.from(this.ai.isConfigured());
  }
}
