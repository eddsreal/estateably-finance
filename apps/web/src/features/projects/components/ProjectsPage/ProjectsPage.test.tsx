import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { ProjectsPage } from './ProjectsPage';

const projects = [
  {
    id: '1',
    name: 'Trip to France',
    status: 'active',
    budget: '500000',
    spent: '110000',
    remaining: '390000',
    overBudget: false,
  },
  {
    id: '2',
    name: 'Home office',
    status: 'closed',
    budget: '5000',
    spent: '7650',
    remaining: '-2650',
    overBudget: true,
  },
  { id: '3', name: 'Remodel', status: 'active', spent: '0', overBudget: false },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectsPage', () => {
  it('lists status, spent and remaining in dollars on cards; no budget reads as absent, not zero (US5 #1, #8)', async () => {
    stubApi({ 'GET /projects': projects });
    renderPage();
    const trip = within(
      (await screen.findByRole('link', { name: 'Trip to France' })).closest('li')!,
    );
    expect(trip.getByText('$5,000.00')).toBeInTheDocument();
    expect(trip.getByText('$1,100.00')).toBeInTheDocument();
    expect(trip.getByText('$3,900.00')).toBeInTheDocument();
    expect(trip.getByText('active')).toBeInTheDocument();
    expect(trip.queryByText(/Over budget/)).not.toBeInTheDocument();

    const remodel = within(screen.getByRole('link', { name: 'Remodel' }).closest('li')!);
    expect(remodel.getByText('active · no budget')).toBeInTheDocument();
    expect(remodel.getByText('$0.00')).toBeInTheDocument();
    expect(remodel.queryByText('Budget')).not.toBeInTheDocument();
    expect(remodel.queryByText('Remaining')).not.toBeInTheDocument();
  });

  it('flags an over-budget project in words with the overrun, not by colour alone (US5 #4)', async () => {
    stubApi({ 'GET /projects': projects });
    renderPage();
    const office = within(
      (await screen.findByRole('link', { name: 'Home office' })).closest('li')!,
    );
    expect(office.getByText(/Over budget by \$26\.50/)).toBeInTheDocument();
    expect(office.getByText('-$26.50')).toBeInTheDocument();
    expect(office.getByText('Closed')).toBeInTheDocument();
    expect(office.getByRole('button', { name: 'Reopen Home office' })).toBeInTheDocument();
  });

  it('states why a project with expenses cannot be deleted instead of offering Delete (FR-014)', async () => {
    stubApi({ 'GET /projects': projects });
    renderPage();
    const trip = within(
      (await screen.findByRole('link', { name: 'Trip to France' })).closest('li')!,
    );
    expect(trip.getByText("Has expenses, can't delete")).toBeInTheDocument();
    expect(trip.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    const remodel = within(screen.getByRole('link', { name: 'Remodel' }).closest('li')!);
    expect(remodel.getByRole('button', { name: 'Delete Remodel' })).toBeInTheDocument();
    expect(remodel.queryByText("Has expenses, can't delete")).not.toBeInTheDocument();
  });

  it('surfaces a rejected delete as the structured error telling to close it (US5 #6)', async () => {
    stubApi({
      'GET /projects': projects,
      'DELETE /projects/3': () => ({
        status: 422,
        body: {
          code: 'DOMAIN_RULE_VIOLATION',
          message:
            'Project 3 is referenced by transactions and cannot be deleted; close it instead',
          correlationId: '6f1b0c1e-8a24-4a5f-9b6d-2f3a7c1d9e10',
        },
      }),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Remodel' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/close it instead/);
    expect(alert).toHaveTextContent('Correlation ID 6f1b0c1e-8a24-4a5f-9b6d-2f3a7c1d9e10');
  });

  it('shows a busy skeleton, then the error with Try again when the list fails', async () => {
    stubApi({
      'GET /projects': () => ({
        status: 500,
        body: { code: 'INTERNAL', message: 'Something broke.', correlationId: 'c-proj' },
      }),
    });
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent('Loading projects…');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correlation ID c-proj');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the empty state with its one action', async () => {
    stubApi({ 'GET /projects': [] });
    renderPage();
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create a project to group expenses and track them against an optional budget.',
      ),
    ).toBeInTheDocument();
  });

  it('closes a project through the API', async () => {
    const closed = vi.fn<() => { body: unknown }>(() => ({
      body: { ...projects[0], status: 'closed' },
    }));
    stubApi({ 'GET /projects': projects, 'POST /projects/1/close': closed });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Close Trip to France' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('creates a project with the budget sent as a string of cents, and rejects a zero budget locally', async () => {
    let sent: unknown;
    stubApi({
      'GET /projects': [],
      'POST /projects': (_url: URL, init?: RequestInit) => {
        sent = JSON.parse(init?.body as string);
        return { status: 201, body: projects[0] };
      },
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'New project' })[0]);
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Name'), 'Trip to France');
    await user.type(dialog.getByLabelText(/Budget/), '0');
    await user.click(dialog.getByRole('button', { name: 'Create project' }));
    expect(await dialog.findByText(/budget must be positive/)).toBeInTheDocument();
    expect(sent).toBeUndefined();

    await user.clear(dialog.getByLabelText(/Budget/));
    await user.type(dialog.getByLabelText(/Budget/), '5,000');
    await user.click(dialog.getByRole('button', { name: 'Create project' }));
    await vi.waitFor(() => expect(sent).toEqual({ name: 'Trip to France', budget: '500000' }));
  });

  it('removes the budget with null when the field is emptied on edit', async () => {
    let sent: unknown;
    stubApi({
      'GET /projects': projects,
      'PATCH /projects/1': (_url: URL, init?: RequestInit) => {
        sent = JSON.parse(init?.body as string);
        return { body: projects[0] };
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Trip to France' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText(/Budget/)).toHaveValue('5,000.00');
    await user.clear(dialog.getByLabelText(/Budget/));
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(sent).toEqual({ name: 'Trip to France', budget: null }));
  });
});
