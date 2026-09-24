import { expect, test } from '@playwright/test';

const API = 'http://localhost:3000';

const ROUTES: { path: string; nav: string; heading: string }[] = [
  { path: '/', nav: 'Accounts', heading: 'Accounts' },
  { path: '/transactions', nav: 'Transactions', heading: 'Transactions' },
  { path: '/report', nav: 'Monthly expenses', heading: 'Monthly report' },
  { path: '/similar', nav: 'Similar transactions', heading: 'Similar transactions' },
  { path: '/upcoming', nav: 'Upcoming', heading: 'Upcoming' },
  { path: '/projection', nav: 'Projection', heading: 'Projection' },
  { path: '/projects', nav: 'Projects', heading: 'Projects' },
  { path: '/categories', nav: 'Categories', heading: 'Categories' },
];

async function detailRoutes(
  request: import('@playwright/test').APIRequestContext,
): Promise<typeof ROUTES> {
  const accounts = (await (await request.get(`${API}/accounts`)).json()) as {
    items: { id: string; name: string }[];
  };
  const projects = (await (await request.get(`${API}/projects`)).json()) as {
    id: string;
    name: string;
  }[];
  const routes: typeof ROUTES = [];
  const account = accounts.items[0];
  if (account)
    routes.push({ path: `/accounts/${account.id}`, nav: 'Accounts', heading: account.name });
  const project = projects[0];
  if (project)
    routes.push({ path: `/projects/${project.id}`, nav: 'Projects', heading: project.name });
  return routes;
}

test('every route marks its sidebar item and renders in Geist (US1 #2)', async ({
  page,
  request,
}) => {
  const routes = [...ROUTES, ...(await detailRoutes(request))];
  expect(routes).toHaveLength(10);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(route.nav);
    await expect(page.locator('body')).toHaveCSS('font-family', /^Geist/);
  }
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('routed content appears without a running animation (US1 #4)', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      const running = await page.evaluate<number>(
        "document.querySelector('main').getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length",
      );
      expect(running).toBe(0);
    }
  });
});
