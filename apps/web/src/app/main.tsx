import './app.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AccountDetailRoute } from '../routes/account-detail';
import { AccountsRoute } from '../routes/accounts';
import { CategoriesRoute } from '../routes/categories';
import { ProjectDetailRoute } from '../routes/project-detail';
import { ProjectionRoute } from '../routes/projection';
import { ProjectsRoute } from '../routes/projects';
import { ReportRoute } from '../routes/report';
import { SimilarRoute } from '../routes/similar';
import { TransactionsRoute } from '../routes/transactions';
import { UpcomingRoute } from '../routes/upcoming';
import { Shell } from './Shell/Shell';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <AccountsRoute /> },
      { path: 'accounts/:id', element: <AccountDetailRoute /> },
      { path: 'transactions', element: <TransactionsRoute /> },
      { path: 'report', element: <ReportRoute /> },
      { path: 'similar', element: <SimilarRoute /> },
      { path: 'upcoming', element: <UpcomingRoute /> },
      { path: 'projection', element: <ProjectionRoute /> },
      { path: 'projects', element: <ProjectsRoute /> },
      { path: 'projects/:id', element: <ProjectDetailRoute /> },
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
