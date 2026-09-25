import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table';

describe('Table', () => {
  it('renders headers and body rows', () => {
    render(
      <Table columns={[{ label: 'Name' }, { label: 'Balance', align: 'right' }]}>
        <tr>
          <td>Checking</td>
          <td className="amount">$1,500.00</td>
        </tr>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$1,500.00' })).toBeInTheDocument();
  });

  it('hides a column header below the md breakpoint when asked', () => {
    render(
      <Table columns={[{ label: 'Date' }, { label: 'Account', hideOnPhone: true }]}>
        <tr>
          <td>1</td>
          <td>2</td>
        </tr>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Account' }).className).toContain(
      'max-md:hidden',
    );
    expect(screen.getByRole('columnheader', { name: 'Date' }).className).not.toContain(
      'max-md:hidden',
    );
  });
});
