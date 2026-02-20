import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from './config/config-provider';
import App from './App';
import './styles.css';

// 获取根元素
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

// 创建根并渲染
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <ConfigProvider
      localConfigPath="/admin-console.config.json"
      enableEnvOverride={true}
      enableLogging={true}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
