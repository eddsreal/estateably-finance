import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon, ICONS } from '../../shared/ui/Icon/Icon';
import { Modal } from '../../shared/ui/Modal/Modal';
import { isActive, NAV_GROUPS } from '../Sidebar/Sidebar';

type Tab = { to: string; label: string; icon: string };

const TABS: Tab[] = [
  { to: '/', label: 'Accounts', icon: ICONS.accounts },
  { to: '/report', label: 'Report', icon: ICONS.report },
];
const TABS_AFTER: Tab[] = [{ to: '/upcoming', label: 'Upcoming', icon: ICONS.upcoming }];

const MORE_GROUPS = NAV_GROUPS.map((group) => ({
  ...group,
  items: group.items.filter((item) => ![...TABS, ...TABS_AFTER].some((tab) => tab.to === item.to)),
})).filter((group) => group.items.length > 0);

const TAB =
  'flex h-full cursor-pointer flex-col items-center justify-center gap-3 text-10 font-medium transition-colors duration-(--dur-hover) ease-(--ease-out)';

export function TabBar({ onAdd }: { onAdd: () => void }) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const tab = (item: Tab) => (
    <Link
      key={item.to}
      to={item.to}
      aria-current={isActive(pathname, item.to) ? 'page' : undefined}
      className={`${TAB} ${isActive(pathname, item.to) ? 'text-text-on-ink' : 'text-ink-400'}`}
    >
      <Icon path={item.icon} size="size-20" />
      {item.label}
    </Link>
  );

  return (
    <>
      <nav
        aria-label="Tabs"
        className="fixed inset-x-12 bottom-20 z-40 grid h-68 grid-cols-5 items-center rounded-4xl bg-ink-900 shadow-toast md:hidden"
      >
        {TABS.map(tab)}
        <button
          type="button"
          aria-label="New transaction"
          className="-mt-22 grid size-52 cursor-pointer place-items-center justify-self-center rounded-2xl bg-accent text-26 text-text-on-ink shadow-accent transition duration-(--dur-hover) ease-(--ease-out) active:scale-97 active:duration-(--dur-press)"
          onClick={onAdd}
        >
          <span aria-hidden="true">+</span>
        </button>
        {TABS_AFTER.map(tab)}
        <button
          type="button"
          aria-haspopup="dialog"
          className={`${TAB} text-ink-400`}
          onClick={() => setMoreOpen(true)}
        >
          <Icon path={ICONS.more} size="size-20" />
          More
        </button>
      </nav>
      <Modal title="More" open={moreOpen} onClose={() => setMoreOpen(false)} variant="sheet">
        <nav aria-label="More" className="flex flex-col gap-18">
          {MORE_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3
                id={`more-${group.title}`}
                className="m-0 px-10 pb-6 font-mono text-10 font-regular tracking-widest text-text-3 uppercase"
              >
                {group.title}
              </h3>
              <ul
                aria-labelledby={`more-${group.title}`}
                className="m-0 flex list-none flex-col gap-2 p-0"
              >
                {group.items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={isActive(pathname, item.to) ? 'page' : undefined}
                      className={`flex h-44 items-center gap-10 rounded-md px-10 text-15 font-medium transition-colors duration-(--dur-hover) ease-(--ease-out) ${isActive(pathname, item.to) ? 'bg-accent-soft text-accent' : 'text-text-1 hover:bg-sand-100'}`}
                      onClick={() => setMoreOpen(false)}
                    >
                      <Icon path={item.icon} size="size-19" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Modal>
    </>
  );
}
