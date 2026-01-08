# Mobile First

## Definition (定义)
> 一种设计和开发策略，优先为移动设备设计界面，然后逐步增强以适应更大的屏幕，而非从桌面端向下适配。

## Context (上下文)
- **Domain**: 响应式设计 / 前端开发
- **Role**: 现代前端设计的核心原则

## Implementation (实现)
代码中可以在以下位置找到相关实现：
- `src/styles/mobile.css` (移动优先样式)
- `src/styles/responsive.css` (响应式断点)

```css
/* Mobile First: 默认样式针对移动设备 */
.container {
  width: 100%;
  padding: 1rem;
}

/* 平板设备 */
@media (min-width: 768px) {
  .container {
    max-width: 720px;
    margin: 0 auto;
  }
}

/* 桌面设备 */
@media (min-width: 1024px) {
  .container {
    max-width: 960px;
    padding: 2rem;
  }
}
```

## Common Misconceptions (常见误区)
> 记录新人容易理解错误的地方，解决"知识诅咒"。
- ❌ 误区：Mobile First 就是隐藏桌面端功能
- ✅ 真相：Mobile First 是渐进增强，从小屏幕开始逐步添加功能
- ❌ 误区：Mobile First 只适用于移动应用
- ✅ 真相：Mobile First 适用于所有响应式网站和应用
- ❌ 误区：Mobile First 会导致桌面端体验变差
- ✅ 真相：良好的 Mobile First 设计在所有设备上都有优秀体验

## Best Practices (最佳实践)

### 1. 使用 min-width 媒体查询
```css
/* ✅ Good: Mobile First */
@media (min-width: 768px) { ... }

/* ❌ Bad: Desktop First */
@media (max-width: 767px) { ... }
```

### 2. 优先考虑触摸交互
- 确保触摸目标至少 44x44 像素
- 避免鼠标悬停依赖的功能
- 支持滑动、捏合等手势

### 3. 性能优先
- 最小化资源加载
- 使用图片懒加载
- 优化 JavaScript 执行

### 4. 内容优先
- 最重要的内容放在最上方
- 避免横向滚动
- 使用折叠式导航

## Relationships (关联)
- Related to: [[ResponsiveDesign]], [[ProgressiveWebApp]]
- Complements: [[CSSGrid]], [[Flexbox]]
- Alternative: [[DesktopFirst]]

## References (参考)
- [Mobile First Design - Smashing Magazine](https://www.smashingmagazine.com/2011/01/guidelines-for-responsive-web-design/)
- [Luke Wroblewski - Mobile First](http://www.lukew.com/ff/entry.asp?933)
- [Responsive Design - MDN](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)