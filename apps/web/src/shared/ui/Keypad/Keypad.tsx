const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

type Key = (typeof KEYS)[number];

export function pressKey(value: string, key: Key): string {
  const plain = value.replaceAll(',', '').trim();
  if (key === '⌫') return plain.slice(0, -1);
  if (key === '.') {
    if (plain.includes('.')) return plain;
    return plain === '' ? '0.' : `${plain}.`;
  }
  if (/\.\d{2}$/.test(plain)) return plain;
  return plain === '0' ? key : `${plain}${key}`;
}

const KEY =
  'grid h-48 cursor-pointer place-items-center rounded-md bg-sand-0 text-22 font-medium text-text-1 shadow-card transition duration-(--dur-hover) ease-(--ease-out) active:scale-97 active:bg-sand-100 active:duration-(--dur-press)';

export function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <fieldset
      aria-label="Keypad"
      className="grid min-w-0 grid-cols-3 gap-6 rounded-lg border-0 bg-sand-200 p-6"
    >
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={KEY}
          aria-label={key === '⌫' ? 'Backspace' : key === '.' ? 'Decimal point' : undefined}
          onClick={() => onChange(pressKey(value, key))}
        >
          {key}
        </button>
      ))}
    </fieldset>
  );
}
