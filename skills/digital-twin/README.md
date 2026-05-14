# 数字分身 · Digital Twin

> 「記憶が人を形作る」— 用记忆塑造一个数字影子

## 简介

数字分身是一个基于用户对话记忆的 AI 技能，能够提取用户的说话风格特征，构建数字分身，让 AI 能模仿用户的说话风格。

## 功能特性

- 🎭 **风格提取**: 从对话记忆中提取说话风格特征
- 🧠 **知识图谱**: 构建技术偏好、项目经验、决策历史的知识图谱
- 💬 **回复生成**: 基于风格和知识生成符合用户人格的回复
- 🔄 **持续学习**: 从新对话中学习，不断改进数字分身
- 🔒 **隐私优先**: 所有数据本地存储，不上传外部服务

## 快速开始

### 1. 提取风格特征

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/extract-style.py
```

### 2. 构建知识图谱

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/extract-knowledge.py
```

### 3. 创建数字分身角色

```bash
python3 ~/.pi/agent/skills/digital-twin/scripts/create-role.py --name twin
```

### 4. 配置网关

在 `~/.pi/gateway/pi-gateway.jsonc` 中添加群组配置：

```json
{
  "channels": {
    "telegram": {
      "groups": {
        "-1003846554405": {
          "requireMention": false,
          "groupPolicy": "open",
          "role": "twin"
        }
      }
    }
  }
}
```

### 5. 重新加载网关配置

```bash
# 通过 pi-gateway 工具重新加载
gateway reload
```

## 使用方法

### 分析说话风格

```
用户: 分析一下我的说话风格
AI: 好的，我来分析你的说话风格。
    - 常用词汇: github, api, cli, pi
    - 消息长度: 平均26字符，66%是短消息
    - 消息类型: 58%命令，24%问题
    - 情绪特征: 好奇心强，不耐烦时直接说
    - 表达习惯: 极简指令型，技术导向
```

### 创建数字分身

```
用户: 帮我创建一个数字分身
AI: 好的，我来帮你创建数字分身。
    1. 首先扫描你的对话记录...
    2. 提取风格特征...
    3. 构建知识图谱...
    4. 创建角色文件...
    完成！你的数字分身已经创建好了。
```

### 生成风格化回复

```
用户: 用我的风格回复"这个技术的原理是什么？"
AI: 这个技术的原理是...
    (基于你的风格特征生成回复)
```

## 文件结构

```
digital-twin/
├── SKILL.md                    # 技能文档
├── README.md                   # 本文件
├── scripts/
│   ├── extract-style.py        # 风格提取脚本
│   ├── extract-knowledge.py    # 知识图谱构建脚本
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

## 技术栈

- **数据源**: 会话记录 (JSONL) + 记忆文件 (Markdown)
- **分析引擎**: Python + 正则表达式 + 统计分析
- **存储格式**: JSON + Markdown
- **角色系统**: Pi Role-Persona 扩展
- **回复生成**: 模板匹配 + 风格修饰

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

## 许可证

MIT License
