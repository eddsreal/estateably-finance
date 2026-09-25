import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { narrativeStream, NarrativeStream, stubApi } from '../../../../test-api-stub';
import { SimilarPage } from './SimilarPage';

const correlationId = '6f1b0c1e-8a24-4a5f-9b6d-2f3a7c1d9e10';

function row(id: string, description: string, amount: string, date: string) {
  return { id, kind: 'expense', date, description, amount, accountId: '1', categoryId: '5' };
}

const rent = row('1', 'Rent', '120000', '2026-09-01');
const uber = [
  row('2', 'uber', '950', '2026-09-15'),
  row('3', 'UBER 5678', '2100', '2026-09-09'),
  row('4', 'Uber 1234', '1830', '2026-09-03'),
];

const report = {
  from: '2026-09-01',
  to: '2026-09-30',
  groups: [
    { key: 'rent', count: 1, total: '120000', transactions: [rent] },
    { key: 'uber', count: 3, total: '4880', transactions: uber },
  ],
  topTransactions: [rent, uber[1], uber[2], uber[0]],
  topGroupKey: 'rent',
};

const emptyReport = {
  from: '2026-08-01',
  to: '2026-08-31',
  groups: [],
  topTransactions: [],
  topGroupKey: null,
};

type NarrativeAnswer = { status?: number; body: unknown } | (() => Response);

function completed(...pieces: string[]): () => Response {
  return () => {
    const stream = narrativeStream(correlationId);
    pieces.forEach((piece) => stream.delta(piece));
    stream.end({ outcome: 'complete' });
    return stream.response;
  };
}

function live(): { answer: () => Response; stream: () => NarrativeStream } {
  let stream: NarrativeStream | undefined;
  return {
    answer: () => {
      stream = narrativeStream(correlationId);
      return stream.response;
    },
    stream: () => stream!,
  };
}

async function summarize() {
  await screen.findByRole('list', { name: 'Top 5 most expensive' });
  await userEvent.click(screen.getByRole('button', { name: '✦ Summarize with AI' }));
}

function narrativeCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Narrative' }).parentElement!;
}

function narrativeText(): string | null | undefined {
  return screen.queryByRole('heading', { name: 'Narrative' })?.nextElementSibling?.textContent;
}

function stubRoutes(narrative: NarrativeAnswer = completed('Unused.'), configured = true) {
  const narrativeCalls: unknown[] = [];
  stubApi({
    'GET /ai/status': { configured },
    'GET /reports/similar': (url: URL) => ({
      body: url.searchParams.get('from') === '2026-08-01' ? emptyReport : report,
    }),
    'POST /reports/similar/narrative': (_url: URL, init?: RequestInit) => {
      narrativeCalls.push(JSON.parse(init?.body as string));
      return typeof narrative === 'function' ? narrative() : narrative;
    },
    'GET /accounts': {
      items: [
        {
          id: '1',
          name: 'Checking',
          kind: 'bank',
          openingBalance: '150000',
          openingDate: '2026-01-01',
          archived: false,
          balance: '445750',
        },
      ],
      totalBalance: '445750',
    },
    'GET /projects': [],
    'GET /categories': [{ id: '5', name: 'Transport', type: 'expense', archived: false }],
  });
  return narrativeCalls;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SimilarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function generate(from = '2026-09-01', to = '2026-09-30') {
  const fromInput = screen.getByLabelText('From');
  await userEvent.clear(fromInput);
  await userEvent.type(fromInput, from);
  const toInput = screen.getByLabelText('To');
  await userEvent.clear(toInput);
  await userEvent.type(toInput, to);
  await userEvent.click(screen.getByRole('button', { name: 'Generate report' }));
}

afterEach(() => vi.unstubAllGlobals());

describe('SimilarPage', () => {
  it('asks for a report first, with the narrative unavailable until one exists', () => {
    stubRoutes();
    renderPage();
    expect(screen.getByText('No report yet')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '✦ Summarize with AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Generate a report to summarize it with AI.');
  });

  it('renders Summarize with AI disabled with its reason when no key is configured', async () => {
    stubRoutes(undefined, false);
    renderPage();
    expect(await screen.findByText('Disabled until an AI key is configured.')).toBeVisible();
    await generate();
    await screen.findByRole('list', { name: 'Top 5 most expensive' });
    const button = screen.getByRole('button', { name: '✦ Summarize with AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Disabled until an AI key is configured.');
  });

  it('shows a failed report with its correlation id and Try again', async () => {
    stubRoutes();
    stubApi({
      'GET /ai/status': { configured: true },
      'GET /reports/similar': () => ({
        status: 500,
        body: { code: 'INTERNAL', message: 'Something broke.', correlationId },
      }),
      'GET /accounts': { items: [], totalBalance: '0' },
      'GET /projects': [],
      'GET /categories': [],
    });
    renderPage();
    await generate();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Correlation ID ${correlationId}`);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows groups with count and dollar totals, the top group and the top 5 (US6 #1, #2, SC-009)', async () => {
    stubRoutes();
    renderPage();
    await generate();
    const groups = await screen.findByRole('list', { name: /^Groups from 2026-09-01/ });
    const uberRow = within(groups).getByText('uber').closest('li')!;
    expect(uberRow).toHaveTextContent('3 expenses');
    expect(uberRow).toHaveTextContent('$48.80');
    expect(uberRow).toHaveTextContent('uber · UBER 5678 · Uber 1234');
    const rentRow = within(groups).getByText('rent').closest('li')!;
    expect(rentRow).toHaveTextContent('Most expensive group');
    expect(uberRow).not.toHaveTextContent('Most expensive group');
    expect(screen.getByText('Expenses only · 4 in 2 groups')).toBeInTheDocument();
    const top = screen.getByRole('list', { name: 'Top 5 most expensive' });
    const items = within(top).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Rent');
    expect(items[0]).toHaveTextContent('1 Sep 2026 · Checking');
    expect(items[0]).toHaveTextContent('$1,200.00');
    expect(within(top).getByRole('button', { name: 'UBER 5678' })).toBeInTheDocument();
    expect(screen.queryByText('4880')).not.toBeInTheDocument();
    expect(screen.queryByText('120000')).not.toBeInTheDocument();
  });

  it('sizes each group bar by its total relative to the largest group', async () => {
    stubRoutes();
    renderPage();
    await generate();
    const groups = await screen.findByRole('list', { name: /^Groups from 2026-09-01/ });
    const bar = (name: string) =>
      within(groups).getByText(name).closest('li')!.querySelector('[style]') as HTMLElement;
    expect(bar('rent').style.width).toBe('100%');
    expect(bar('uber').style.width).toBe(`${(4880 / 120000) * 100}%`);
  });

  it('shows the empty state for a period without expenses (US6 #3)', async () => {
    stubRoutes();
    renderPage();
    await generate('2026-08-01', '2026-08-31');
    expect(await screen.findByText('No similar expenses in this range')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No two expenses between 1 Aug 2026 and 31 Aug 2026 have a similar description.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change dates' }));
    expect(screen.getByLabelText('From')).toHaveFocus();
  });

  it('requests the narrative for the generated range and shows it', async () => {
    const calls = stubRoutes(completed('Rent dominated this month.'));
    renderPage();
    await generate();
    await screen.findByRole('list', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ Summarize with AI' }));
    expect(await screen.findByText('Rent dominated this month.')).toBeInTheDocument();
    expect(calls).toEqual([{ from: '2026-09-01', to: '2026-09-30' }]);
  });

  it('disables the narrative and says why once the API answers AI_NOT_CONFIGURED (FR-015)', async () => {
    stubRoutes({
      status: 422,
      body: {
        code: 'AI_NOT_CONFIGURED',
        message: 'No LLM provider key is configured',
        correlationId,
      },
    });
    renderPage();
    await generate();
    await screen.findByRole('list', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ Summarize with AI' }));
    const button = await screen.findByRole('button', { name: '✦ Summarize with AI' });
    await vi.waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('title', 'Disabled until an AI key is configured.');
    expect(button).toHaveAccessibleDescription('Disabled until an AI key is configured.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a dismissible notice on provider failure while the report stays on screen (FR-015)', async () => {
    stubRoutes({
      status: 504,
      body: {
        code: 'AI_TIMEOUT',
        message: 'The LLM provider timed out after 10000 ms',
        correlationId,
      },
    });
    renderPage();
    await generate();
    await screen.findByRole('list', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ Summarize with AI' }));
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('The LLM provider timed out after 10000 ms');
    expect(notice).toHaveTextContent(`Correlation ID ${correlationId}`);
    expect(within(notice).getByRole('button', { name: 'Copy ID' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Top 5 most expensive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✦ Summarize with AI' })).toBeEnabled();
    expect(notice).toHaveTextContent(
      "The AI summary couldn't be generated. The report below is unaffected.",
    );
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Top 5 most expensive' })).toBeInTheDocument();
  });

  it('retries the narrative from the failure notice', async () => {
    const calls = stubRoutes({
      status: 504,
      body: {
        code: 'AI_TIMEOUT',
        message: 'The LLM provider timed out after 10000 ms',
        correlationId,
      },
    });
    renderPage();
    await generate();
    await screen.findByRole('list', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ Summarize with AI' }));
    const notice = await screen.findByRole('alert');
    await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('grows the text piece by piece, in order, with two announcements (US1, FR-007a)', async () => {
    const { answer, stream } = live();
    stubRoutes(answer);
    renderPage();
    await generate();
    await summarize();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Generating summary…');
    expect(screen.queryByRole('heading', { name: 'Narrative' })).not.toBeInTheDocument();
    stream().delta('Rent ');
    await vi.waitFor(() => expect(narrativeText()).toBe('Rent '));
    expect(narrativeCard()).toHaveAttribute('aria-busy', 'true');
    expect(narrativeCard()).not.toHaveAttribute('aria-live');
    expect(status).toHaveTextContent('Generating summary…');
    stream().delta('dominated.');
    await vi.waitFor(() => expect(narrativeText()).toBe('Rent dominated.'));
    stream().end({ outcome: 'complete' });
    await vi.waitFor(() => expect(status).toHaveTextContent('Summary complete.'));
    expect(narrativeCard()).toHaveAttribute('aria-busy', 'false');
    expect(narrativeText()).toBe('Rent dominated.');
    expect(screen.getByRole('list', { name: 'Top 5 most expensive' })).toBeInTheDocument();
  });

  it('empties the announcement on a pre-text failure and shows the notice instead', async () => {
    stubRoutes({
      status: 502,
      body: { code: 'AI_PROVIDER_ERROR', message: 'The provider failed', correlationId },
    });
    renderPage();
    await generate();
    await summarize();
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('The provider failed');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.queryByRole('heading', { name: 'Narrative' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Top 5 most expensive' })).toBeInTheDocument();
  });

  it('opens the edit form from a top-5 transaction', async () => {
    stubRoutes();
    renderPage();
    await generate();
    await userEvent.click(await screen.findByRole('button', { name: 'Uber 1234' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit transaction');
    expect(screen.getByLabelText('Amount')).toHaveValue('18.30');
  });
});
