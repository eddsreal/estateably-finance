import type { Ref } from 'react';
import { formatPlain, parseDollars } from '../../lib/money';

type MoneyInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
};

export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  autoFocus,
  invalid,
  describedBy,
  ref,
}: MoneyInputProps) {
  return (
    <input
      id={id}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        const cents = parseDollars(value);
        if (cents !== null && value.trim() !== '') onChange(formatPlain(cents));
        onBlur?.();
      }}
    />
  );
}
