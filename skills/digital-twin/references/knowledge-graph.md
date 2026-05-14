# 知识图谱构建

## 概述

知识图谱构建是数字分身的核心功能之一，负责从用户的对话记忆中提取结构化知识。

## 算法流程

### 1. 数据收集

从以下来源收集用户记忆：

1. **记忆文件** (`~/.pi/roles/<role>/memory/`)
   - `consolidated.md`: 长期记忆
   - `pending.md`: 待验证记忆
   - `daily/*.md`: 每日记忆

### 2. 知识提取

#### 2.1 技术偏好

提取用户的技术偏好：

```python
# 技术偏好模式
tech_pref_patterns = [
    (r'偏好(.+)', 'preference'),
    (r'喜欢(.+)', 'preference'),
    (r'推荐(.+)', 'recommendation'),
    (r'首选(.+)', 'preference')
]
```

#### 2.2 项目经验

提取用户的项目经验：

```python
# 项目经验模式
project_patterns = [
    (r'项目[：:](.+)', 'project'),
    (r'开发了(.+)', 'development'),
    (r'实现了(.+)', 'implementation'),
    (r'部署了(.+)', 'deployment')
]
```

#### 2.3 决策历史

提取用户的决策历史：

```python
# 决策历史模式
decision_patterns = [
    (r'选择[了](.+)', 'choice'),
    (r'采用了(.+)', 'adoption'),
    (r'放弃了(.+)', 'abandonment')
]
```

#### 2.4 观点态度

提取用户的观点态度：

```python
# 观点态度模式
opinion_patterns = [
    (r'我认为(.+)', 'opinion'),
    (r'我觉得(.+)', 'opinion'),
    (r'本质上(.+)', 'essence'),
    (r'关键是(.+)', 'key_point')
]
```

### 3. 技术栈统计

统计用户提到的技术栈：

```python
tech_keywords = [
    'typescript', 'javascript', 'python', 'java', 'rust', 'go',
    'react', 'vue', 'docker', 'kubernetes', 'postgres', 'redis',
    'api', 'sdk', 'cli', 'git', 'npm', 'yarn', 'bun',
    'pi', 'agent', 'memory', 'extension', 'skill', 'gateway'
]

for keyword in tech_keywords:
    if keyword in memory.lower():
        tech_stack[keyword] += 1
```

### 4. 工具统计

统计用户提到的工具：

```python
tool_keywords = [
    'docker', 'kubernetes', 'nginx', 'redis', 'postgres',
    'git', 'npm', 'yarn', 'bun', 'webpack', 'vite',
    'eslint', 'prettier', 'jest', 'mocha', 'pytest'
]

for tool in tool_keywords:
    if tool in memory.lower():
        tools[tool] += 1
```

## 输出格式

### 知识图谱 (knowledge-graph.json)

```json
{
  "techPreferences": [
    "TypeScript (类型安全)",
    "Vue 3 + TypeScript (前端)",
    "Java (Spring Boot) (后端)"
  ],
  "projects": [
    "digital-twin: 数字分身项目",
    "pi-agent: Pi Agent 框架",
    "role-persona: 角色人格系统"
  ],
  "decisions": [
    "选择 TypeScript 因为类型安全",
    "采用 Clean Architecture 因为可维护性",
    "使用 Docker 因为容器化"
  ],
  "opinions": [
    "我认为 Go 是更好的选择",
    "关键是编译速度快",
    "本质上是性能考虑"
  ],
  "techStack": {
    "typescript": 2,
    "javascript": 1,
    "python": 1,
    "java": 1,
    "rust": 1,
    "go": 1,
    "react": 1,
    "vue": 1,
    "docker": 1,
    "kubernetes": 1,
    "postgres": 1,
    "redis": 1,
    "api": 5,
    "sdk": 1,
    "cli": 7,
    "git": 9,
    "npm": 1,
    "yarn": 1,
    "bun": 1,
    "pi": 11,
    "agent": 6,
    "memory": 2,
    "extension": 4,
    "skill": 2,
    "gateway": 2
  },
  "tools": {
    "docker": 3,
    "kubernetes": 1,
    "nginx": 1,
    "redis": 1,
    "postgres": 1,
    "git": 9,
    "npm": 1,
    "yarn": 1,
    "bun": 1,
    "webpack": 1,
    "vite": 1,
    "eslint": 1,
    "prettier": 1,
    "jest": 1,
    "mocha": 1,
    "pytest": 1
  }
}
```

### 知识摘要 (knowledge-summary.md)

```markdown
## 知识图谱摘要

### 技术偏好
- TypeScript (类型安全)
- Vue 3 + TypeScript (前端)
- Java (Spring Boot) (后端)

### 项目经验
- digital-twin: 数字分身项目
- pi-agent: Pi Agent 框架
- role-persona: 角色人格系统

### 决策历史
- 选择 TypeScript 因为类型安全
- 采用 Clean Architecture 因为可维护性
- 使用 Docker 因为容器化

### 观点态度
- 我认为 Go 是更好的选择
- 关键是编译速度快
- 本质上是性能考虑

### 技术栈
- pi: 11次
- git: 9次
- cli: 7次
- agent: 6次
- api: 5次
- extension: 4次
- docker: 3次

### 常用工具
- git: 9次
- docker: 3次
- npm: 1次
- yarn: 1次
- bun: 1次
```

## 优化建议

1. **增加实体识别**: 当前使用简单正则表达式，可以考虑使用 NER 模型
2. **增加关系提取**: 当前只提取实体，可以考虑提取实体之间的关系
3. **增加时间分析**: 可以分析用户在不同时间段的知识变化
4. **增加置信度计算**: 可以为每个知识节点计算置信度
5. **增加知识验证**: 可以通过用户反馈验证知识的准确性
