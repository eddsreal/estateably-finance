export const ICONS = {
  bank: 'M3 10h18M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18M12 3l9 5H3l9-5z',
  cash: 'M2 6h20v12H2zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M5 9h.01M19 15h.01',
  card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zM2 10h20M6 15h3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
  unarchive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M12 17v-6M9 14l3-3 3 3',
} as const;

type IconProps = { path: string; size: 'size-15' | 'size-17' | 'size-19' };

export function Icon({ path, size }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${size} flex-none stroke-(length:--icon-stroke)`}
    >
      <path d={path} />
    </svg>
  );
}
