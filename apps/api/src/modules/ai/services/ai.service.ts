import { Injectable } from '@nestjs/common';
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../../../common/domain-errors/domain-errors';
import { ReportsService, SimilarReportData } from '../../reports/services/reports.service';

export const LLM_MODEL = 'claude-haiku-4-5-20251001';

function timeoutMs(): number {
  const value = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0 ? value : 10000;
}

const SYSTEM_PROMPT = [
  'You summarise a personal expense report for its owner in two or three sentences.',
  'Write plain text only: no Markdown, no headings, no bold, no lists.',
  'Use only the figures given and never add, subtract or estimate amounts yourself.',
  'Amounts are integer cents of one currency; state them in dollars by dividing by 100 (120000 is $1,200.00).',
].join(' ');

function prompt(report: SimilarReportData): string {
  return JSON.stringify({
    from: report.from,
    to: report.to,
    periodTotalCents: report.groups.reduce((sum, group) => sum + group.total, 0n).toString(),
    transactionCount: report.groups.reduce((sum, group) => sum + group.count, 0),
    mostExpensiveGroup: report.topGroupKey,
    groups: report.groups.map((group) => ({
      description: group.key,
      count: group.count,
      totalCents: group.total.toString(),
    })),
  });
}

export function plainText(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s.*$/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class AiService {
  constructor(private readonly reports: ReportsService) {}

  async similarNarrative(from: string, to: string): Promise<string> {
    const apiKey = process.env.LLM_API_KEY ?? '';
    if (apiKey === '') throw new AiNotConfiguredError();
    const report = await this.reports.similar(from, to);
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.anthropic.com';
    const timeout = timeoutMs();
    try {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt(report) }],
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 429) throw new AiRateLimitedError();
      if (!res.ok) throw new AiProviderError();
      const body = (await res.json()) as { content?: { text?: unknown }[] };
      const raw = body.content?.[0]?.text;
      const text = typeof raw === 'string' ? plainText(raw) : '';
      if (text === '') throw new AiProviderError();
      return text;
    } catch (error) {
      if (error instanceof AiRateLimitedError || error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError')
        throw new AiTimeoutError(timeout);
      throw new AiProviderError();
    }
  }
}
