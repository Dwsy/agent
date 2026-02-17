import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './layout/app-shell';
import { OverviewPage } from './pages/overview-page';
import { AgentsPage } from './pages/agents-page';
import { PluginsPage } from './pages/plugins-page';
import { AlertsPage } from './pages/alerts-page';
import { SettingsPage } from './pages/settings-page';
import { MetricsPage } from './pages/metrics-page';
import { useConfig } from './config/config-provider';
import { NotFoundPlaceholder } from './components/feature-gate';
import { useMemo } from 'react';

// QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * 路由守卫组件：根据功能开关决定是否渲染
 */
function FeatureRoute({
  feature,
  children,
}: {
  feature: 'overview' | 'agents' | 'plugins' | 'alerts' | 'settings' | 'metrics';
  children: React.ReactNode;
}): React.ReactNode {
  const { isFeatureEnabled } = useConfig();
  const enabled = isFeatureEnabled(feature);

  if (!enabled) {
    // 如果功能关闭，显示 Not Found 占位
    return <NotFoundPlaceholder />;
  }

  return children;
}

/**
 * 应用内容组件（需要 ConfigProvider 上下文）
 */
function AppContent() {
  const { isLoading } = useConfig();

  // 动态生成路由配置
  const router = useMemo(() => {
    return createBrowserRouter([
      {
        path: '/',
        element: <AppShell />,
        children: [
          {
            index: true,
            element: isLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-sm text-slate-500">Loading...</div>
              </div>
            ) : (
              <FeatureRoute feature="overview">
                <OverviewPage />
              </FeatureRoute>
            ),
          },
          // 各功能路由（受 FeatureGate 控制）
          {
            path: 'overview',
            element: (
              <FeatureRoute feature="overview">
                <OverviewPage />
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
          // 未匹配路由：显示 Not Found
          {
            path: '*',
            element: <NotFoundPlaceholder />,
          },
        ],
      },
    ]);
  }, [isLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

/**
 * 主应用组件
 */
export default function App() {
  return <AppContent />;
}
