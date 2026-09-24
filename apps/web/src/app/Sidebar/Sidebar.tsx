import { Link, useLocation } from 'react-router';
import { localToday } from '../../shared/lib/dates';
import { Icon, ICONS } from '../../shared/ui/Icon/Icon';

type NavItem = { to: string; label: string; icon: string };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Money',
    items: [
      {
        to: '/',
        label: 'Accounts',
        icon: ICONS.accounts,
      },
      {
        to: '/transactions',
        label: 'Transactions',
        icon: ICONS.transactions,
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/report', label: 'Monthly expenses', icon: ICONS.report },
      {
        to: '/similar',
        label: 'Similar transactions',
        icon: ICONS.similar,
      },
    ],
  },
  {
    title: 'Planning',
    items: [
      {
        to: '/upcoming',
        label: 'Upcoming',
        icon: ICONS.upcoming,
      },
      { to: '/projection', label: 'Projection', icon: ICONS.projection },
      {
        to: '/projects',
        label: 'Projects',
        icon: ICONS.projects,
      },
    ],
  },
  {
    title: 'Setup',
    items: [
      {
        to: '/categories',
        label: 'Categories',
        icon: ICONS.categories,
      },
    ],
  },
];

const LINK =
  'flex h-36 items-center gap-10 rounded-md px-10 text-14 font-medium transition-colors duration-(--dur-hover) ease-(--ease-out)';

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/' || pathname.startsWith('/accounts/');
  return pathname === to || pathname.startsWith(`${to}/`);
}

function linkClass(active: boolean): string {
  return active
    ? `${LINK} bg-ink-800 text-text-on-ink shadow-nav-active`
    : `${LINK} text-ink-300 hover:bg-ink-850 hover:text-text-on-ink`;
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
  const { pathname } = useLocation();
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
                  <Link
                    to={item.to}
                    aria-current={isActive(pathname, item.to) ? 'page' : undefined}
                    className={linkClass(isActive(pathname, item.to))}
                  >
                    <Icon path={item.icon} size="size-17" />
                    {item.label}
                  </Link>
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
