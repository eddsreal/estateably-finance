import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from './ErrorNotice';

const apiError = {
  code: 'INTERNAL',
  message: 'Something went wrong on our side.',
  correlationId: '01J8Z4P2MN-7C1D',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ErrorNotice', () => {
  it('shows the message and correlation id, copies it and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn<() => void>();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorNotice title="Transactions couldn't load." error={apiError} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("⚠ Transactions couldn't load.");
    expect(screen.getByText(/Something went wrong on our side\./)).toBeInTheDocument();
    expect(screen.getByText('Correlation ID 01J8Z4P2MN-7C1D')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy ID' }));
    expect(writeText).toHaveBeenCalledWith('01J8Z4P2MN-7C1D');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('explains a network failure and offers no Copy ID without an id', () => {
    render(
      <ErrorNotice
        title="Transactions couldn't load."
        error={new TypeError()}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(/Check that the API is running/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy ID' })).not.toBeInTheDocument();
  });
});
