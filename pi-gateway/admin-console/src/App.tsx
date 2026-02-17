import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './layout/app-shell';
import { OverviewPage } from './pages/overview-page';
import { AgentsPage } from './pages/agents-page';
import { PluginsPage } from './pages/plugins-page';
import { AlertsPage } from './pages/alerts-page';
import { SettingsPage } from './pages/settings-page';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
