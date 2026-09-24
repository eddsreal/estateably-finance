import { BUTTON_COMPACT } from '../../lib/styles';
import { Icon } from '../Icon/Icon';

type EmptyStateProps = {
  icon: string;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-10 rounded-2xl border border-sand-350 bg-sand-0 px-20 py-22">
      <span className="grid size-40 place-items-center rounded-lg bg-sand-200 text-text-strong">
        <Icon path={icon} size="size-20" />
      </span>
      <p className="text-16 font-semibold tracking-snug text-text-1">{title}</p>
      <p className="text-13 text-pretty text-text-strong">{hint}</p>
      {action && (
        <button type="button" className={`${BUTTON_COMPACT} mt-4`} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
