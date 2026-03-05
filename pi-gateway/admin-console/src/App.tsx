import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Center, Loader } from '@mantine/core';
import { AppShell } from './layout/app-shell';
import { useConfig } from './config/config-provider';
import { NotFoundPlaceholder } from './components/feature-gate';

const OverviewPage = lazy(() => import('./pages/overview-page').then((module) => ({ default: module.OverviewPage })));
const ChatPage = lazy(() => import('./pages/chat-page').then((module) => ({ default: module.ChatPage })));
const AgentsPage = lazy(() => import('./pages/agents-page').then((module) => ({ default: module.AgentsPage })));
const PluginsPage = lazy(() => import('./pages/plugins-page').then((module) => ({ default: module.PluginsPage })));
const AlertsPage = lazy(() => import('./pages/alerts-page').then((module) => ({ default: module.AlertsPage })));
const SettingsPage = lazy(() => import('./pages/settings-page').then((module) => ({ default: module.SettingsPage })));
const MetricsPage = lazy(() => import('./pages/metrics-page').then((module) => ({ default: module.MetricsPage })));

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
      createHashRouter([
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
      <Suspense
        fallback={
          <Center h="60vh">
            <Loader />
          </Center>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  );
}

export default function App() {
  return <AppContent />;
}
