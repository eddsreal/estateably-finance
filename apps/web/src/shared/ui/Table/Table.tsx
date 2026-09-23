import { ReactNode } from 'react';

type Column = { label: string; align?: 'left' | 'right' };

type TableProps = {
  columns: Column[];
  caption?: string;
  children: ReactNode;
};

export function Table({ columns, caption, children }: TableProps) {
  return (
    <table className="table">
      {caption && <caption className="visually-hidden">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label} className={column.align === 'right' ? 'amount' : undefined}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
