---
name: digital-twin
description: "数字分身技能 - 从对话记忆中提取风格特征，构建数字分身。当用户想要：创建数字分身、分析说话风格、提取对话特征、构建人格模型、让AI模仿某人说话时使用。触发词：数字分身、digital twin、说话风格、对话分析、人格模仿、风格提取、记忆分析。"
---

# 数字分身 · Digital Twin

> 「記憶が人を形作る」— 用记忆塑造一个数字影子

## 核心功能

从用户的对话记忆中提取风格特征，构建数字分身，让 AI 能模仿用户的说话风格。

## 使用场景

1. **创建数字分身**: 用户想要创建一个能模仿自己说话风格的 AI
2. **分析说话风格**: 用户想要了解自己的对话习惯和风格特征
3. **提取对话特征**: 用户想要从历史对话中提取有用的信息
4. **构建人格模型**: 用户想要为 AI 构建一个独特的人格
5. **风格迁移**: 用户想要让 AI 学习某人的说话风格

## 工作流程

### 阶段 1: 数据收集

1. **扫描会话记录**
   - 位置: `~/.pi/gateway/sessions/transcripts/*.jsonl`
   - 格式: JSONL，每行一个 JSON 对象
   - 类型: `user_message` 包含用户消息

2. **扫描记忆文件**
   - 位置: `~/.pi/roles/<role>/memory/`
   - 文件: `consolidated.md`, `pending.md`, `daily/*.md`

3. **清洗数据**
   - 过滤系统指令（如 `[Concise Output Mode]`）
   - 过滤过短消息（<2字符）
   - 过滤纯数字消息

### 阶段 2: 风格提取

1. **词汇分析**
   - 提取常用词汇（排除停用词）
   - 统计词频
   - 识别技术术语

2. **句式分析**
   - 提取常用句式开头
   - 分析消息长度分布
   - 识别消息类型（命令/问题/陈述）

3. **情绪分析**
   - 检测情绪表达模式
   - 识别不耐烦/满意/好奇等情绪
   - 分析标点使用习惯

4. **表达习惯**
   - 提取常用表达模式
   - 识别口头禅
   - 分析幽默风格

### 阶段 3: 知识图谱构建

1. **技术偏好**
   - 提取技术栈偏好
   - 识别常用工具
   - 分析技术决策

2. **项目经验**
   - 提取项目经历
   - 识别项目角色
   - 分析项目贡献

3. **决策历史**
   - 提取技术决策
   - 识别决策模式
   - 分析决策原因

### 阶段 4: 回复生成

1. **模板匹配**
   - 根据消息类型选择模板
   - 根据用户情绪调整回复
   - 根据上下文生成回复

2. **风格应用**
   - 应用词汇偏好
   - 应用句式习惯
   - 应用情绪表达

3. **持续学习**
   - 从新对话中学习
   - 更新风格模型
   - 优化回复策略

## 脚本说明

### extract-style.py

从对话记忆中提取风格特征。

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/extract-style.py
```

输出:
- `~/.pi/agent/skills/digital-twin/data/style-profile.json`
- `~/.pi/agent/skills/digital-twin/data/style-description.md`

### extract-knowledge.py

从对话记忆中构建知识图谱。

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/extract-knowledge.py
```

输出:
- `~/.pi/agent/skills/digital-twin/data/knowledge-graph.json`
- `~/.pi/agent/skills/digital-twin/data/knowledge-summary.md`

### generate-reply.py

基于风格和知识生成回复。

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/generate-reply.py --message "你好" --sender "朋友"
```

输出:
- 回复文本
- 置信度
- 使用的知识节点

### create-role.py

创建数字分身角色。

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/create-role.py --name "twin"
```

输出:
- `~/.pi/roles/<name>/core/` 角色核心文件
- `~/.pi/roles/<name>/memory/` 角色记忆文件

## 参考文档

### 风格提取算法

参考 `references/style-extraction.md`

### 知识图谱构建

参考 `references/knowledge-graph.md`

### 回复生成策略

参考 `references/response-generation.md`

## 使用示例

### 示例 1: 创建数字分身

```
用户: 帮我创建一个数字分身
AI: 好的，我来帮你创建数字分身。
    1. 首先扫描你的对话记录...
    2. 提取风格特征...
    3. 构建知识图谱...
    4. 创建角色文件...
    完成！你的数字分身已经创建好了。
```

### 示例 2: 分析说话风格

```
用户: 分析一下我的说话风格
AI: 好的，我来分析你的说话风格。
    - 常用词汇: github, api, cli, pi
    - 消息长度: 平均26字符，66%是短消息
    - 消息类型: 58%命令，24%问题
    - 情绪特征: 好奇心强，不耐烦时直接说
    - 表达习惯: 极简指令型，技术导向
```

### 示例 3: 生成风格化回复

```
用户: 用我的风格回复"这个技术的原理是什么？"
AI: 这个技术的原理是...
    (基于你的风格特征生成回复)
```

## 注意事项

1. **隐私保护**: 所有数据本地存储，不上传外部服务
2. **数据安全**: 不存储他人的聊天内容
3. **可删除性**: 用户可随时删除所有数据
4. **持续学习**: 分身会从新对话中学习，不断改进
5. **风格保持**: 分身会保持用户的说话风格，但不会完全复制

## 扩展功能

1. **多角色支持**: 可以为不同场景创建不同分身
2. **风格迁移**: 可以将一个分身的风格迁移到另一个
3. **情绪识别**: 可以识别用户的情绪状态
4. **上下文记忆**: 可以记住对话上下文
5. **知识更新**: 可以从新对话中更新知识图谱

## 技术栈

- **数据源**: 会话记录 (JSONL) + 记忆文件 (Markdown)
- **分析引擎**: Python + 正则表达式 + 统计分析
- **存储格式**: JSON + Markdown
- **角色系统**: Pi Role-Persona 扩展
- **回复生成**: 模板匹配 + 风格修饰

## 文件结构

```
digital-twin/
├── SKILL.md                    # 本文件
├── scripts/
│   ├── extract-style.py        # 风格提取脚本
│   ├── extract-knowledge.py    # 知识图谱构建脚本
│   ├── generate-reply.py       # 回复生成脚本
│   └── create-role.py          # 角色创建脚本
├── references/
│   ├── style-extraction.md     # 风格提取算法文档
│   ├── knowledge-graph.md      # 知识图谱构建文档
│   └── response-generation.md  # 回复生成策略文档
├── assets/
│   └── templates/              # 回复模板
└── data/
    ├── style-profile.json      # 风格模型
    ├── knowledge-graph.json    # 知识图谱
    └── clean-messages.json     # 清洗后的消息
```
