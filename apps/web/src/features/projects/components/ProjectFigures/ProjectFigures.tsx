import { Cents, formatCents } from '../../../../shared/lib/money';

export type ProjectFiguresData = {
  budget?: string;
  spent: string;
  remaining?: string;
  overBudget: boolean;
};

export function RemainingAmount({ project }: { project: ProjectFiguresData }) {
  if (project.remaining === undefined) return <span className="amount">No budget</span>;
  if (project.overBudget) {
    const overrun = (-BigInt(project.remaining)).toString() as Cents;
    return <span className="amount warning">{formatCents(overrun)} over</span>;
  }
  return <span className="amount">{formatCents(project.remaining as Cents)}</span>;
}

export function OverBudgetChip() {
  return (
    <span className="chip warning">
      <span aria-hidden="true">▲</span>Over budget
    </span>
  );
}
