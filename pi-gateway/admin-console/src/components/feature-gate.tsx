import { Alert, Anchor, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { Ban, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useConfig } from '../config/config-provider';
import type { FeaturesConfig } from '../config/schema';

interface FeatureGateProps {
  feature: keyof FeaturesConfig;
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
  loadingPlaceholder?: ReactNode;
}

export function FeatureGate({
  feature,
  children,
  fallback = null,
  showLoading = false,
  loadingPlaceholder = null,
}: FeatureGateProps) {
  const { isFeatureEnabled, isLoading } = useConfig();

  if (isLoading && showLoading) return <>{loadingPlaceholder}</>;
  return isFeatureEnabled(feature) ? <>{children}</> : <>{fallback}</>;
}

export function FeatureGateOff({
  feature,
  children,
  fallback = null,
}: Omit<FeatureGateProps, 'showLoading' | 'loadingPlaceholder'>) {
  return (
    <FeatureGate feature={feature} fallback={children}>
      {fallback}
    </FeatureGate>
  );
}

interface MultiFeatureGateProps extends Omit<FeatureGateProps, 'feature'> {
  features: Array<keyof FeaturesConfig>;
  mode: 'any' | 'all';
}

export function MultiFeatureGate({ features, mode, children, fallback = null }: MultiFeatureGateProps) {
  const { config } = useConfig();
  const enabled =
    mode === 'any'
      ? features.some((feature) => config.features[feature])
      : features.every((feature) => config.features[feature]);
  return enabled ? <>{children}</> : <>{fallback}</>;
}

export function withFeature<P extends object>(
  Component: React.ComponentType<P>,
  feature: keyof FeaturesConfig,
  fallback?: ReactNode,
): React.FC<P> {
  return function WithFeatureComponent(props: P) {
    return (
      <FeatureGate feature={feature} fallback={fallback}>
        <Component {...props} />
      </FeatureGate>
    );
  };
}

export function FeatureDisabledPlaceholder({ feature, message }: { feature?: string; message?: string }) {
  return (
    <Alert icon={<Ban size={16} />} color="gray" title="Feature unavailable" variant="light">
      {message || `Feature ${feature ? `"${feature}"` : ''} is disabled in configuration.`}
    </Alert>
  );
}

export function NotFoundPlaceholder() {
  return (
    <Center h="70vh">
      <Stack align="center" gap="sm">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <SearchX size={28} />
        </ThemeIcon>
        <Title order={2}>404</Title>
        <Text c="dimmed" size="sm">
          页面不存在或功能已关闭
        </Text>
        <Anchor href="/">返回 Overview</Anchor>
      </Stack>
    </Center>
  );
}
