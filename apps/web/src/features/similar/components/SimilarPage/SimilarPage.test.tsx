import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
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

function stubRoutes(narrative: { status?: number; body: unknown }) {
  const narrativeCalls: unknown[] = [];
  stubApi({
    'GET /reports/similar': (url: URL) => ({
      body: url.searchParams.get('from') === '2026-08-01' ? emptyReport : report,
    }),
    'POST /reports/similar/narrative': (_url: URL, init?: RequestInit) => {
      narrativeCalls.push(JSON.parse(init?.body as string));
      return narrative;
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
    stubRoutes({ body: { narrative: '' } });
    renderPage();
    expect(screen.getByText('No report yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✦ AI narrative' })).toBeDisabled();
  });

  it('shows groups with count and dollar totals, the top group and the top 5 (US6 #1, #2, SC-009)', async () => {
    stubRoutes({ body: { narrative: '' } });
    renderPage();
    await generate();
    const groups = await screen.findByRole('table', { name: /^Groups from 2026-09-01/ });
    const uberRow = within(groups).getByText('uber').closest('tr')!;
    expect(uberRow).toHaveTextContent('3');
    expect(uberRow).toHaveTextContent('$48.80');
    const rentRow = within(groups).getByText('rent').closest('tr')!;
    expect(rentRow).toHaveTextContent('Most expensive group');
    expect(uberRow).not.toHaveTextContent('Most expensive group');
    const top = screen.getByRole('table', { name: 'Top 5 most expensive' });
    expect(within(top).getAllByRole('row')).toHaveLength(5);
    expect(within(top).getByRole('button', { name: 'UBER 5678' })).toBeInTheDocument();
    expect(screen.queryByText('4880')).not.toBeInTheDocument();
    expect(screen.queryByText('120000')).not.toBeInTheDocument();
  });

  it('shows the empty state for a period without expenses (US6 #3)', async () => {
    stubRoutes({ body: { narrative: '' } });
    renderPage();
    await generate('2026-08-01', '2026-08-31');
    expect(await screen.findByText('No expenses in this period')).toBeInTheDocument();
  });

  it('requests the narrative for the generated range and shows it', async () => {
    const calls = stubRoutes({ body: { narrative: 'Rent dominated this month.' } });
    renderPage();
    await generate();
    await screen.findByRole('table', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ AI narrative' }));
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
    await screen.findByRole('table', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ AI narrative' }));
    const button = await screen.findByRole('button', { name: '✦ AI narrative' });
    await vi.waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('title', 'AI narrative is disabled: no API key configured.');
    expect(button).toHaveAccessibleDescription('AI narrative is disabled: no API key configured.');
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
    await screen.findByRole('table', { name: 'Top 5 most expensive' });
    await userEvent.click(screen.getByRole('button', { name: '✦ AI narrative' }));
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('AI_TIMEOUT');
    expect(notice).toHaveTextContent(correlationId);
    expect(screen.getByRole('table', { name: 'Top 5 most expensive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✦ AI narrative' })).toBeEnabled();
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Top 5 most expensive' })).toBeInTheDocument();
  });

  it('opens the edit form from a top-5 transaction', async () => {
    stubRoutes({ body: { narrative: '' } });
    renderPage();
    await generate();
    await userEvent.click(await screen.findByRole('button', { name: 'Uber 1234' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit transaction');
    expect(screen.getByLabelText('Amount')).toHaveValue('18.30');
  });
});
