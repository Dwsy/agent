import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, ColorSchemeScript, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ConfigProvider } from './config/config-provider';
import { adminTheme } from './theme/theme';
import App from './App';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

const manager = localStorageColorSchemeManager({ key: 'pi-gateway-color-scheme' });

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider theme={adminTheme} defaultColorScheme="auto" colorSchemeManager={manager}>
      <Notifications position="top-right" />
      <ConfigProvider localConfigPath="/admin-console.config.json" enableEnvOverride={true} enableLogging={true}>
        <App />
      </ConfigProvider>
    </MantineProvider>
  </StrictMode>
);
