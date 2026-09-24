import { NavLink } from 'react-router';
import { localToday } from '../../shared/lib/dates';

type NavItem = { to: string; label: string; icon: string };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Money',
    items: [
      {
        to: '/',
        label: 'Accounts',
        icon: 'M3 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm0 0V6a2 2 0 0 1 2-2h11M16.5 13h.01',
      },
      {
        to: '/transactions',
        label: 'Transactions',
        icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/report', label: 'Monthly expenses', icon: 'M3 20h18M7 20v-7M12 20V5M17 20v-10' },
      {
        to: '/similar',
        label: 'Similar transactions',
        icon: 'M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5',
      },
    ],
  },
  {
    title: 'Planning',
    items: [
      {
        to: '/upcoming',
        label: 'Upcoming',
        icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zM4 9h16M8 3v4M16 3v4',
      },
      { to: '/projection', label: 'Projection', icon: 'M3 17l6-6 4 4 8-8M21 12V7h-5' },
      {
        to: '/projects',
        label: 'Projects',
        icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
      },
    ],
  },
  {
    title: 'Setup',
    items: [
      {
        to: '/categories',
        label: 'Categories',
        icon: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9zM7.5 7.5h.01',
      },
    ],
  },
];

const LINK =
  'flex h-36 items-center gap-10 rounded-md px-10 text-14 font-medium transition-colors duration-(--dur-hover) ease-(--ease-out)';

function linkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${LINK} bg-ink-800 text-text-on-ink shadow-nav-active`
    : `${LINK} text-ink-300 hover:bg-ink-850 hover:text-text-on-ink`;
}

function Icon({ path, size }: { path: string; size: 'size-15' | 'size-17' }) {
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

function footerDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${localToday()}T00:00:00Z`));
}

export function Sidebar() {
  return (
    <aside className="flex h-full w-232 flex-col gap-18 rounded-2xl bg-ink-900 px-12 py-18">
      <div className="flex items-center gap-10 px-8">
        <span
          aria-hidden="true"
          className="grid size-30 place-items-center rounded-sm bg-accent text-14 font-bold text-text-on-ink"
        >
          E
        </span>
        <span className="text-15 font-semibold tracking-snug text-text-on-ink">Estateably</span>
      </div>
      <div className="flex h-36 items-center gap-8 rounded-md bg-ink-850 px-10 text-13 text-ink-300">
        <Icon path="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4" size="size-15" />
        Search
        <kbd className="ml-auto rounded-xs bg-ink-700 px-6 py-2 font-mono text-11 text-ink-200">
          ⌘K
        </kbd>
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-18">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <h2
              id={`nav-${group.title}`}
              className="m-0 px-10 pb-6 font-mono text-10 font-regular tracking-widest text-ink-400 uppercase"
            >
              {group.title}
            </h2>
            <ul
              aria-labelledby={`nav-${group.title}`}
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/'} className={linkClass}>
                    <Icon path={item.icon} size="size-17" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="m-0 mt-auto border-t border-ink-750 px-10 pt-12 font-mono text-12 text-ink-300">
        {footerDate()} · USD
      </p>
    </aside>
  );
}
