import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../../../common/domain-errors/domain-errors';
import { ReportsService, SimilarReportData } from '../../reports/services/reports.service';
import { AiService, LLM_MODEL, plainText } from './ai.service';

const report: SimilarReportData = {
  from: '2026-09-01',
  to: '2026-09-30',
  groups: [
    { key: 'rent', count: 1, total: 120000n, transactions: [] },
    { key: 'uber', count: 3, total: 5490n, transactions: [] },
  ],
  topTransactions: [],
  topGroupKey: 'rent',
};

function build() {
  const reports = {
    similar: vi.fn<() => Promise<SimilarReportData>>().mockResolvedValue(report),
  };
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return { service: new AiService(reports as unknown as ReportsService), reports, fetchMock };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AiService.similarNarrative', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_BASE_URL', 'http://stub.local');
    vi.stubEnv('LLM_TIMEOUT_MS', '2500');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers AI_NOT_CONFIGURED without any network call when the key is empty', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const { service, fetchMock, reports } = build();
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reports.similar).not.toHaveBeenCalled();
  });

  it('posts the grouped report to the Messages API and returns the first text block', async () => {
    const { service, fetchMock, reports } = build();
    fetchMock.mockResolvedValue(json(200, { content: [{ type: 'text', text: ' Uber led. ' }] }));
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).resolves.toBe('Uber led.');
    expect(reports.similar).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://stub.local/v1/messages');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(LLM_MODEL);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.system).toContain('plain text only');
    const data = JSON.parse(body.messages[0].content);
    expect(data.periodTotalCents).toBe('125490');
    expect(data.transactionCount).toBe(4);
    expect(data.mostExpensiveGroup).toBe('rent');
    expect(data.groups[1]).toEqual({ description: 'uber', count: 3, totalCents: '5490' });
  });

  it('maps 429 to AI_RATE_LIMITED and makes exactly one call', async () => {
    const { service, fetchMock } = build();
    fetchMock.mockResolvedValue(json(429, { type: 'error' }));
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).rejects.toBeInstanceOf(
      AiRateLimitedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps any other non-2xx, a network failure or a malformed body to AI_PROVIDER_ERROR', async () => {
    const { service, fetchMock } = build();
    fetchMock.mockResolvedValueOnce(json(500, { type: 'error' }));
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).rejects.toBeInstanceOf(
      AiProviderError,
    );
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).rejects.toBeInstanceOf(
      AiProviderError,
    );
    fetchMock.mockResolvedValueOnce(json(200, { content: [] }));
    await expect(service.similarNarrative('2026-09-01', '2026-09-30')).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps the abort-signal timeout to AI_TIMEOUT naming LLM_TIMEOUT_MS, without retrying', async () => {
    const { service, fetchMock } = build();
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    const error = await service.similarNarrative('2026-09-01', '2026-09-30').catch((e) => e);
    expect(error).toBeInstanceOf(AiTimeoutError);
    expect(error.message).toContain('2500 ms');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('plainText', () => {
  it('strips Markdown headings, bold and bullets the model may still emit', () => {
    expect(
      plainText(
        '# Expense Report Summary (Sept 1–24)\nYour spending was **$1,254.90**.\n\n- Rent led at __$1,200.00__.',
      ),
    ).toBe('Your spending was $1,254.90. Rent led at $1,200.00.');
  });

  it('leaves plain prose untouched and empties a heading-only answer', () => {
    expect(plainText('Rent led your spending.')).toBe('Rent led your spending.');
    expect(plainText('## Summary')).toBe('');
  });
});
