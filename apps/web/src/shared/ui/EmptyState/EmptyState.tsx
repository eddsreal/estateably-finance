import { BUTTON_PRIMARY } from '../../lib/styles';

type EmptyStateProps = {
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-24 py-48 text-center text-14 text-text-2">
      <p className="text-17 font-semibold text-text-1">{title}</p>
      <p>{hint}</p>
      {actionLabel && onAction && (
        <button type="button" className={`${BUTTON_PRIMARY} mt-8`} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
