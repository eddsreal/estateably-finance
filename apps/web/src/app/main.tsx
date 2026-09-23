import '../../../../design/tokens.css';
import './app.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, NavLink, Outlet, RouterProvider } from 'react-router';
import { AccountDetailRoute } from '../routes/account-detail';
import { AccountsRoute } from '../routes/accounts';
import { CategoriesRoute } from '../routes/categories';
import { ReportRoute } from '../routes/report';
import { TransactionsRoute } from '../routes/transactions';

function Shell() {
  return (
    <>
      <nav className="app-nav" aria-label="Primary">
        <span className="brand">Estateably Finance</span>
        <NavLink to="/" end>
          Accounts
        </NavLink>
        <NavLink to="/transactions">Transactions</NavLink>
        <NavLink to="/report">Report</NavLink>
        <NavLink to="/categories">Categories</NavLink>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <AccountsRoute /> },
      { path: 'accounts/:id', element: <AccountDetailRoute /> },
      { path: 'transactions', element: <TransactionsRoute /> },
      { path: 'report', element: <ReportRoute /> },
      { path: 'categories', element: <CategoriesRoute /> },
    ],
  },
]);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const container = document.getElementById('root');
if (!container) throw new Error('missing #root container');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
