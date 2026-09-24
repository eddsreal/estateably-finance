export const ICONS = {
  bank: 'M3 10h18M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18M12 3l9 5H3l9-5z',
  cash: 'M2 6h20v12H2zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M5 9h.01M19 15h.01',
  card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zM2 10h20M6 15h3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
  unarchive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M12 17v-6M9 14l3-3 3 3',
  accounts:
    'M3 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm0 0V6a2 2 0 0 1 2-2h11M16.5 13h.01',
  transactions: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  report: 'M3 20h18M7 20v-7M12 20V5M17 20v-10',
  similar: 'M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5',
  upcoming:
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zM4 9h16M8 3v4M16 3v4',
  projection: 'M3 17l6-6 4 4 8-8M21 12V7h-5',
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  categories: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9zM7.5 7.5h.01',
} as const;

type IconProps = { path: string; size: 'size-15' | 'size-17' | 'size-19' | 'size-20' };

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
