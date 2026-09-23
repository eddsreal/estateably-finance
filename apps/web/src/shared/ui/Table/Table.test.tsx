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
});
