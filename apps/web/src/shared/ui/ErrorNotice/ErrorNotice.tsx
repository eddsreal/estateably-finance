import { useState } from 'react';
import { isApiError, NETWORK_ERROR } from '../../lib/form-errors';
import { BUTTON_COMPACT } from '../../lib/styles';

type ErrorNoticeProps = {
  title: string;
  error: unknown;
  onRetry?: () => void;
};

export function ErrorNotice({ title, error, onRetry }: ErrorNoticeProps) {
  const [copied, setCopied] = useState(false);
  const correlationId = isApiError(error) ? error.correlationId : undefined;

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-10 rounded-2xl border border-negative-line bg-sand-0 p-20"
    >
      <p className="text-15 font-semibold text-negative">⚠ {title}</p>
      <p className="text-13 text-text-strong">
        {isApiError(error) ? error.message : NETWORK_ERROR}
        {correlationId && ' Try again; if it keeps happening, share this ID.'}
      </p>
      {correlationId && (
        <p className="rounded-md bg-sand-100 px-8 py-6 font-mono text-12 text-text-1">
          Correlation ID {correlationId}
        </p>
      )}
      <div className="flex gap-6">
        {onRetry && (
          <button
            type="button"
            className="inline-flex h-32 cursor-pointer items-center rounded-sm bg-ink-900 px-12 text-13 font-semibold text-text-on-ink transition duration-(--dur-hover) ease-(--ease-out) active:scale-97 active:duration-(--dur-press)"
            onClick={onRetry}
          >
            Try again
          </button>
        )}
        {correlationId && (
          <button
            type="button"
            className={BUTTON_COMPACT}
            onClick={() => {
              void navigator.clipboard.writeText(correlationId).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy ID'}
          </button>
        )}
      </div>
    </div>
  );
}
