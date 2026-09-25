import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../test-api-stub';
import { useToast } from '../../shared/ui/Toast/Toast';
import { Shell } from './Shell';

const onUndo = vi.fn<() => Promise<void>>(() => Promise.resolve());

function Probe() {
  const { show } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          show({ kind: 'undo', message: 'Transaction recorded.', transactionId: 't1', onUndo })
        }
      >
        create
      </button>
      <label>
        Note
        <input type="text" />
      </label>
    </>
  );
}

function renderShell() {
  document.documentElement.style.setProperty('--dur-undo', '5s');
  stubApi({});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  onUndo.mockClear();
  document.documentElement.removeAttribute('style');
  vi.unstubAllGlobals();
});

describe('Shell ⌘Z', () => {
  it('leaves ⌘Z to the text field when focus is inside one', async () => {
    const user = renderShell();
    await user.click(screen.getByRole('button', { name: 'create' }));
    await user.click(screen.getByLabelText('Note'));
    await user.keyboard('{Meta>}z{/Meta}{Control>}z{/Control}');
    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
  });

  it('triggers the open Undo when focus is outside a text field', async () => {
    const user = renderShell();
    await user.click(screen.getByRole('button', { name: 'create' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
    await user.keyboard('{Meta>}z{/Meta}');
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('Shell on a phone', () => {
  it('swaps the sidebar for the tab bar, whose Add opens the new-transaction sheet with the keypad', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.startsWith('(width <'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const user = renderShell();
    expect(screen.getByRole('complementary').parentElement?.className).toContain('max-md:hidden');
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    await user.click(within(tabs).getByRole('button', { name: 'New transaction' }));
    const sheet = screen.getByRole('dialog', { name: 'New transaction' });
    expect(sheet.className).toContain('open:animate-sheet');
    expect(within(sheet).getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });

  it('keeps the centred dialog without a keypad at desktop width', async () => {
    const user = renderShell();
    await user.click(screen.getByRole('button', { name: 'New transaction' }));
    const dialog = screen.getByRole('dialog', { name: 'New transaction' });
    expect(dialog.className).toContain('open:animate-dialog');
    expect(within(dialog).queryByRole('group', { name: 'Keypad' })).not.toBeInTheDocument();
  });
});
