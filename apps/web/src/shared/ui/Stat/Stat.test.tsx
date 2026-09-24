import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stat } from './Stat';

describe('Stat', () => {
  it('names its value by its caption', () => {
    render(
      <Stat caption="Current balance" detail={<span>of a budget</span>}>
        $4,457.50
      </Stat>,
    );
    expect(screen.getByRole('status', { name: 'Current balance' })).toHaveTextContent('$4,457.50');
    expect(screen.getByText('of a budget')).toBeInTheDocument();
  });
});
