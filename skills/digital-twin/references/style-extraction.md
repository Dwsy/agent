# 风格提取算法

## 概述

风格提取是数字分身的核心功能之一，负责从用户的对话记忆中提取说话风格特征。

## 算法流程

### 1. 数据收集

从以下来源收集用户消息：

1. **会话记录** (`~/.pi/gateway/sessions/transcripts/*.jsonl`)
   - 格式: JSONL
   - 类型: `user_message`
   - 清洗: 过滤系统指令、过短消息、纯数字消息

2. **记忆文件** (`~/.pi/roles/<role>/memory/`)
   - `consolidated.md`: 长期记忆
   - `pending.md`: 待验证记忆
   - `daily/*.md`: 每日记忆

### 2. 词汇分析

#### 2.1 分词

使用正则表达式提取中文和英文词汇：

```python
words = re.findall(r'[\w\u4e00-\u9fff]+', text.lower())
```

#### 2.2 停用词过滤

过滤常见停用词：

```python
stop_words = {
    '的', '了', '是', '在', '我', '你', '他', '她', '它',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    # ... 更多停用词
}
```

#### 2.3 词频统计

使用 Counter 统计词频：

```python
word_counter = Counter()
for word in words:
    if word not in stop_words and len(word) > 1:
        word_counter[word] += 1
```

### 3. 技术术语识别

预定义技术关键词列表：

```python
tech_keywords = [
    'typescript', 'javascript', 'python', 'java', 'rust', 'go',
    'react', 'vue', 'docker', 'kubernetes', 'postgres', 'redis',
    'api', 'sdk', 'cli', 'git', 'npm', 'yarn', 'bun',
    'pi', 'agent', 'memory', 'extension', 'skill', 'gateway',
    'telegram', 'bot', 'server', 'client', 'database', 'cf',
    'cloudflare', 'github', 'websocket', 'http', 'ssh'
]
```

统计每个技术术语在消息中出现的次数。

### 4. 句式分析

#### 4.1 消息长度分布

将消息按长度分为三类：

- 短消息 (<20字符)
- 中等消息 (20-100字符)
- 长消息 (>100字符)

#### 4.2 消息类型分布

根据关键词判断消息类型：

- **命令**: 包含 "帮我"、"查看"、"搜索"、"发我" 等
- **问题**: 包含 "什么"、"怎么"、"为什么"、"吗" 等
- **陈述**: 其他消息

#### 4.3 句式开头

提取消息的前2-3个词作为句式开头模式：

```python
words = message.split()
if len(words) >= 2:
    start = ' '.join(words[:2])
    start_patterns[start] += 1
```

### 5. 情绪分析

#### 5.1 情绪模式

预定义情绪模式：

```python
emotional_patterns = {
    'frustrated': ['算了', '为啥', '做不到', '不想', '不行'],
    'curious': ['原理', '为什么', '怎么', '如何'],
    'impatient': ['快', '直接', '马上', '立刻'],
    'casual': ['噢噢', '欧克', '好的', '行']
}
```

#### 5.2 情绪检测

遍历消息，检测是否包含情绪关键词：

```python
for emotion, patterns in emotional_patterns.items():
    if any(p in message for p in patterns):
        return emotion
```

### 6. 表达习惯提取

#### 6.1 习惯模式

预定义表达习惯模式：

```python
habit_patterns = [
    (r'帮我', '请求帮助'),
    (r'查看', '查看信息'),
    (r'搜索', '搜索信息'),
    (r'发我', '要求发送'),
    (r'原理', '追问原理'),
    (r'为什么', '追问原因'),
    (r'怎么', '询问方法'),
    (r'可以', '询问能力'),
    (r'启动', '启动操作'),
    (r'继续', '继续操作')
]
```

#### 6.2 习惯统计

统计每种表达习惯在消息中出现的次数：

```python
for pattern, habit in habit_patterns:
    count = sum(1 for msg in messages if pattern in msg)
    if count > 0:
        habits.append(f"{habit}({count}次)")
```

## 输出格式

### 风格模型 (style-profile.json)

```json
{
  "frequentWords": {
    "github": 7,
    "api": 5,
    "cli": 7
  },
  "techTerms": {
    "http": 14,
    "pi": 11,
    "git": 9
  },
  "humorStyle": "dry",
  "expressionHabits": [
    "请求帮助(5次)",
    "查看信息(5次)",
    "搜索信息(7次)"
  ],
  "sentencePatterns": [
    "帮我 分析",
    "查看 当前",
    "搜索 一下"
  ],
  "messagePatterns": {
    "commands": ["帮我分析一下", "查看当前系统状态"],
    "questions": ["这个技术的原理是什么？", "为什么选择这个方案？"],
    "greetings": ["你好", "在吗"],
    "emotional": [["frustrated", "算了，我自己来吧"]]
  },
  "messageLength": {
    "short": 65,
    "medium": 28,
    "long": 5
  },
  "messageTypes": {
    "commands": 57,
    "questions": 24,
    "statements": 15
  }
}
```

### 风格描述 (style-description.md)

```markdown
## 说话风格分析

### 常用词汇 (Top 10)
- github: 7次
- api: 5次
- cli: 7次

### 技术术语 (Top 10)
- http: 14次
- pi: 11次
- git: 9次

### 消息长度分布
- short: 65 (66.3%)
- medium: 28 (28.6%)
- long: 5 (5.1%)

### 消息类型分布
- commands: 57 (58.2%)
- questions: 24 (24.5%)
- statements: 15 (15.3%)

### 表达习惯
- 请求帮助(5次)
- 查看信息(5次)
- 搜索信息(7次)

### 常用句式开头
- "帮我 分析"
- "查看 当前"
- "搜索 一下"
```

## 优化建议

1. **增加更多情绪模式**: 当前情绪模式较少，可以增加更多情绪识别
2. **改进分词算法**: 当前使用简单正则表达式，可以考虑使用更复杂的分词器
3. **增加上下文分析**: 当前只分析单条消息，可以考虑分析消息之间的关系
4. **增加时间分析**: 可以分析用户在不同时间段的说话风格变化
5. **增加话题分析**: 可以分析用户在不同话题下的说话风格变化
