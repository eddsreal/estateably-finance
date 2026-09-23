type EmptyStateProps = {
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="title">{title}</p>
      <p>{hint}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
