import { useMemo, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Center, Loader } from '@mantine/core';
import { AppShell } from './layout/app-shell';
import { OverviewPage } from './pages/overview-page';
import { ChatPage } from './pages/chat-page';
import { AgentsPage } from './pages/agents-page';
import { PluginsPage } from './pages/plugins-page';
import { AlertsPage } from './pages/alerts-page';
import { SettingsPage } from './pages/settings-page';
import { MetricsPage } from './pages/metrics-page';
import { useConfig } from './config/config-provider';
import { NotFoundPlaceholder } from './components/feature-gate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function FeatureRoute({
  feature,
  children,
}: {
  feature: 'overview' | 'chat' | 'agents' | 'plugins' | 'alerts' | 'settings' | 'metrics';
  children: ReactNode;
}) {
  const { isFeatureEnabled } = useConfig();
  return isFeatureEnabled(feature) ? children : <NotFoundPlaceholder />;
}

function AppContent() {
  const { isLoading } = useConfig();

  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          path: '/',
          element: <AppShell />,
          children: [
            {
              index: true,
              element: isLoading ? (
                <Center h="60vh">
                  <Loader />
                </Center>
              ) : (
                <FeatureRoute feature="overview">
                  <OverviewPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'overview',
              element: (
                <FeatureRoute feature="overview">
                  <OverviewPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'chat',
              element: (
                <FeatureRoute feature="chat">
                  <ChatPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'agents',
              element: (
                <FeatureRoute feature="agents">
                  <AgentsPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'plugins',
              element: (
                <FeatureRoute feature="plugins">
                  <PluginsPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'alerts',
              element: (
                <FeatureRoute feature="alerts">
                  <AlertsPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'settings',
              element: (
                <FeatureRoute feature="settings">
                  <SettingsPage />
                </FeatureRoute>
              ),
            },
            {
              path: 'metrics',
              element: (
                <FeatureRoute feature="metrics">
                  <MetricsPage />
                </FeatureRoute>
              ),
            },
            {
              path: '*',
              element: <NotFoundPlaceholder />,
            },
          ],
        },
      ]),
    [isLoading],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default function App() {
  return <AppContent />;
}
