import { Outlet } from 'react-router';
import { Sidebar } from '../Sidebar/Sidebar';

export function Shell() {
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 h-screen flex-none py-12 pl-12">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
