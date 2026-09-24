import { ReactNode } from 'react';

type Column = { label: string; align?: 'left' | 'right' };

type TableProps = {
  columns: Column[];
  caption?: string;
  children: ReactNode;
};

export function Table({ columns, caption, children }: TableProps) {
  return (
    <table className="w-full border-collapse text-14">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.label}
              className={`h-40 border-b border-sand-350 bg-sand-50 px-12 font-mono text-11 font-regular tracking-wide text-text-2 uppercase ${column.align === 'right' ? 'text-right' : 'text-left'}`}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="*:*:h-44 *:*:border-b *:*:border-sand-200 *:*:px-12 *:*:py-4 *:last:*:border-b-0">
        {children}
      </tbody>
    </table>
  );
}
