# pi-gateway 架构改进 PRD

## 背景
pi-gateway 是 pi agent 框架的核心网关服务，随着功能迭代，代码库出现了架构债务，需要进行系统性重构以提升可维护性。

## 目标
1. 提升代码可维护性（Maintainability）
2. 优化架构分层（Architecture）
3. 规范测试体系（Testing）
4. 统一类型定义（Type Safety）

## 范围
- `src/core/` - 核心逻辑重构
- `src/**/*.test.ts` - 测试体系整理
- `src/**/types.ts` - 类型系统统一
- `src/plugins/` - 插件架构评估

## 非目标
- 不修改业务逻辑
- 不破坏现有 API 接口
- 不引入新的依赖

## 验收标准
- [ ] core/ 目录按职责清晰分层
- [ ] 测试文件命名规范，无冗余 BBD 文件
- [ ] 类型定义集中到 types/ 目录
- [ ] 插件边界清晰，生命周期明确
