# Progressive Web App

## Definition (定义)
> 使用现代 Web 技术构建的应用，提供类似原生应用的用户体验，包括离线支持、推送通知和安装能力。

## Context (上下文)
- **Domain**: 前端开发 / Web 应用
- **Role**: 跨平台应用开发的现代解决方案

## Implementation (实现)
代码中可以在以下位置找到相关实现：
- `public/sw.js` (Service Worker)
- `public/manifest.json` (应用清单)
- `src/utils/pwa.ts` (PWA 工具函数)

```javascript
// Service Worker 注册
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered:', registration);
      })
      .catch(error => {
        console.log('SW registration failed:', error);
      });
  });
}
```

## Common Misconceptions (常见误区)
> 记录新人容易理解错误的地方，解决"知识诅咒"。
- ❌ 误区：PWA 就是移动网站
- ✅ 真相：PWA 可以安装到主屏幕，支持离线，提供原生应用体验
- ❌ 误区：PWA 适用于所有类型的应用
- ✅ 真相：PWA 适合内容型、工具型应用，不适用于需要复杂硬件交互的应用
- ❌ 误区：PWA 会自动离线工作
- ✅ 真相：需要实现 Service Worker 和缓存策略才能支持离线

## Core Features (核心特性)

### 1. 离线支持
- Service Worker 缓存策略
- 离线页面显示
- 后台同步

### 2. 可安装性
- Add to Home Screen
- 应用图标
- 启动画面

### 3. 推送通知
- 本地通知
- Web Push API
- 通知权限管理

### 4. 性能优化
- 快速加载
- 平滑过渡
- 响应式设计

## Optimization Strategies (优化策略)

### 1. 缓存策略
- Cache First: 静态资源
- Network First: API 请求
- Stale While Revalidate: 内容更新

### 2. 资源优化
- 图片压缩和懒加载
- 代码分割
- Web Workers

### 3. 性能监控
- Lighthouse 评分
- Core Web Vitals
- 真实用户监控（RUM）

## Relationships (关联)
- Depends on: [[ServiceWorker]], [[HTTPS]]
- Related to: [[MobileFirst]], [[ResponsiveDesign]]
- Complements: [[IndexedDB]], [[WebStorage]]

## References (参考)
- [PWA - MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev - PWA](https://web.dev/progressive-web-apps/)
- [PWA Builder](https://www.pwabuilder.com/)