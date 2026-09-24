import { Cents, formatCents } from '../../../../shared/lib/money';
import { Amount } from '../../../../shared/ui/Amount/Amount';
import { CHIP_WARNING } from '../../../../shared/lib/styles';

export type ProjectFiguresData = {
  budget?: string;
  spent: string;
  remaining?: string;
  overBudget: boolean;
};

export function RemainingAmount({ project }: { project: ProjectFiguresData }) {
  if (project.remaining === undefined) return <span className="text-text-2">No budget</span>;
  if (project.overBudget) {
    const overrun = (-BigInt(project.remaining)).toString() as Cents;
    return (
      <span className="font-mono font-medium text-warning tabular-nums">
        {formatCents(overrun)} over
      </span>
    );
  }
  return <Amount cents={project.remaining} />;
}

export function OverBudgetChip() {
  return (
    <span className={CHIP_WARNING}>
      <span aria-hidden="true">▲</span>Over budget
    </span>
  );
}
