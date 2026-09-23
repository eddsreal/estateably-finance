import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { NarrativeRequestDto } from '../dtos/narrative-request.dto';
import { NarrativeResponseDto } from '../dtos/narrative-response.dto';
import { AiService } from '../services/ai.service';

@Controller('reports/similar')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('narrative')
  @HttpCode(200)
  async narrative(@Body() body: NarrativeRequestDto): Promise<NarrativeResponseDto> {
    return NarrativeResponseDto.from(await this.ai.similarNarrative(body.from, body.to));
  }
}
