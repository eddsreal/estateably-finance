import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import { correlationIdOf } from '../../../common/correlation-id.middleware/correlation-id.middleware';
import { buildLogger } from '../../../common/logging.interceptor/logging.interceptor';
import { AiStatusResponseDto } from '../dtos/ai-status-response.dto';
import { NarrativeRequestDto } from '../dtos/narrative-request.dto';
import { AiService } from '../services/ai.service';

function sseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

@Controller()
export class AiController {
  private readonly logger = buildLogger();

  constructor(private readonly ai: AiService) {}

  @Post('reports/similar/narrative')
  @HttpCode(200)
  async narrative(
    @Body() body: NarrativeRequestDto,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    const events = this.ai.similarNarrative(body.from, body.to, controller.signal);
    let next = await events.next();
    let finished: object = { outcome: 'client_closed' };
    if (!next.done) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.flushHeaders();
      for (; !next.done; next = await events.next()) {
        const event = next.value;
        if (event.type === 'delta') {
          res.write(sseEvent('delta', { text: event.text }));
          continue;
        }
        const data = event.reason
          ? { outcome: event.outcome, reason: event.reason }
          : { outcome: event.outcome };
        res.write(sseEvent('end', data));
        finished = data;
      }
    }
    res.end();
    this.logger.log({ correlationId: correlationIdOf(req), ...finished });
  }

  @Get('ai/status')
  getAiStatus(): AiStatusResponseDto {
    return AiStatusResponseDto.from(this.ai.isConfigured());
  }
}
