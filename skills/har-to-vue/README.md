# HAR to Vue - 使用指南

将 HAR（HTTP Archive）文件转换为 Vue 源代码的技能。

## 快速开始

### 安装依赖

```bash
cd ~/.pi/agent/skills/har-to-vue
bun install
```

### 基本用法

```bash
# 转换为 Vue 组件
bun scripts/har_to_vue.ts assets/example.har -o ./output

# 转换为 API 服务（按路径分组）
bun scripts/har_to_vue.ts assets/example.har --mode api --group-by path -o ./output

# 生成完整页面
bun scripts/har_to_vue.ts assets/example.har --mode page -o ./output

# 使用 TypeScript 和 Axios
bun scripts/har_to_vue.ts assets/example.har --typescript --library axios -o ./output
```

## 命令选项

| 选项 | 说明 | 默认值 |
|-----|------|--------|
| `-o, --output` | 输出目录 | `./output` |
| `-m, --mode` | 转换模式 | `component` |
| `-t, --template` | 模板类型 | `composition` |
| `--typescript` | 生成 TypeScript | `false` |
| `-l, --library` | HTTP 客户端 | `fetch` |
| `--group-by` | 分组策略 | - |
| `--filter-domain` | 过滤域名 | - |
| `--exclude-extensions` | 排除扩展名 | `css,js,png,...` |
| `--methods` | HTTP 方法 | `GET,POST,PUT,DELETE` |

## 转换模式

### Component 模式

生成单个 Vue 组件，包含所有请求的数据获取和模板。

```bash
bun scripts/har_to_vue.ts capture.har -o components/
```

输出:
```
components/
└── GeneratedComponent.vue
```

### API 模式

生成 API 服务函数，可按路径或域名分组。

```bash
bun scripts/har_to_vue.ts capture.har --mode api --group-by path -o api/
```

输出:
```
api/
├── index.ts
├── users.ts
└── products.ts
```

### Page 模式

生成完整的页面结构，包括组件、API、类型定义。

```bash
bun scripts/har_to_vue.ts capture.har --mode page -o pages/
```

输出:
```
pages/generated-page/
├── index.vue
├── api/
│   └── index.ts
└── types.ts
```

## 示例

### 示例 1: 复刻用户列表页面

```bash
# 从浏览器导出 HAR 文件
bun scripts/har_to_vue.ts user-list.har \
  --mode component \
  --typescript \
  --library axios \
  -o src/components/UserList.vue
```

### 示例 2: 生成完整 API 服务

```bash
bun scripts/har_to_vue.ts api-capture.har \
  --mode api \
  --typescript \
  --library axios \
  --group-by path \
  --filter-domain api.example.com \
  -o src/api/
```

### 示例 3: 生成带状态的页面

```bash
bun scripts/har_to_vue.ts dashboard.har \
  --mode page \
  --typescript \
  --template composition \
  -o src/pages/dashboard/
```

## 测试示例

使用内置的示例 HAR 文件测试:

```bash
# 生成组件
bun scripts/har_to_vue.ts assets/example.har -o ./test-output

# 查看输出
cat ./test-output/GeneratedComponent.vue
```

## 工作流

1. **捕获网络请求**: 使用浏览器开发者工具 (F12) 网络面板
2. **导出 HAR 文件**: 右键 → 保存所有为 HAR with Content
3. **运行转换**: 使用 `har_to_vue.ts` 脚本
4. **调整输出**: 根据需要修改生成的代码

## 故障排除

### 没有找到符合条件的请求

- 检查 HAR 文件是否包含有效请求
- 调整 `--filter-domain` 或 `--methods` 选项
- 检查 `--exclude-extensions` 是否过滤了所有请求

### 类型推断不准确

- 手动编辑生成的 `types.ts` 文件
- 添加缺失的字段或修正类型
- 提取重复类型到共享文件

### 生成的组件需要调整

- 模板部分可能需要手动优化
- 添加样式和交互逻辑
- 根据业务需求调整数据结构

## 高级用法

### 自定义模板

创建自定义 Vue 模板文件:

```bash
bun scripts/har_to_vue.ts input.har --template-file my-template.vue -o ./output
```

### 配置文件

创建 `har-to-vue.config.json`:

```json
{
  "mode": "api",
  "typescript": true,
  "library": "axios",
  "output": "./src/api",
  "filter": {
    "includeDomains": ["api.example.com"],
    "excludeExtensions": ["css", "js", "png"]
  }
}
```

## 参考资料

- [HAR 格式规范](references/HAR_SPEC.md)
- [Vue 3 Composition API](references/VUE_COMPOSITION.md)
- [TypeScript 类型推断](references/TS_INFERENCE.md)
- [Axios 拦截器](references/AXIOS_INTERCEPTORS.md)
- [常见转换模式](references/PATTERNS.md)