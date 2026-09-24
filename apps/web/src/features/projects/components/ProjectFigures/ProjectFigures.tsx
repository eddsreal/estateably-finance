import { Cents, change, compareCents, formatCents } from '../../../../shared/lib/money';
import { Amount } from '../../../../shared/ui/Amount/Amount';

export type ProjectFiguresData = {
  budget?: string;
  spent: string;
  remaining?: string;
};

export function overBudgetBy(project: ProjectFiguresData): Cents | null {
  if (project.budget === undefined) return null;
  const budget = project.budget as Cents;
  const spent = project.spent as Cents;
  return compareCents(spent, budget) > 0 ? change(budget, spent) : null;
}

export function hasExpenses(project: ProjectFiguresData): boolean {
  return compareCents(project.spent as Cents, '0' as Cents) > 0;
}

export function RemainingAmount({ project }: { project: ProjectFiguresData }) {
  if (project.remaining === undefined) return <span className="text-text-2">No budget</span>;
  const tone =
    compareCents(project.remaining as Cents, '0' as Cents) > 0 ? 'text-accent-hover' : '';
  return (
    <span className={tone}>
      <Amount cents={project.remaining} />
    </span>
  );
}

export function OverBudgetChip({ by }: { by: Cents }) {
  return (
    <span className="inline-flex h-24 items-center gap-4 rounded-pill bg-negative-soft px-9 text-12 font-semibold whitespace-nowrap text-negative-strong">
      <span aria-hidden="true">⚠</span>Over budget by {formatCents(by)}
    </span>
  );
}
