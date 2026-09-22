import '../../../../design/tokens.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';

function Shell() {
  return (
    <main>
      <Outlet />
    </main>
  );
}

const router = createBrowserRouter([{ path: '/', element: <Shell /> }]);
const queryClient = new QueryClient();

const container = document.getElementById('root');
if (!container) throw new Error('missing #root container');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
