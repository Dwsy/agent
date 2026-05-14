# 回复生成策略

## 概述

回复生成是数字分身的核心功能之一，负责基于风格模型和知识图谱生成符合用户人格的回复。

## 算法流程

### 1. 消息分析

#### 1.1 消息类型检测

根据关键词判断消息类型：

```python
def analyze_message_type(message):
    # 问候
    if is_greeting(message):
        return 'greeting'
    
    # 链接
    if contains_link(message):
        return 'link'
    
    # 命令
    if is_command(message):
        return 'command'
    
    # 问题
    if is_question(message):
        return 'question'
    
    # 技术讨论
    if is_technical_discussion(message):
        return 'technical'
    
    # 情绪表达
    if is_emotional_expression(message):
        return 'emotional'
    
    return 'general'
```

#### 1.2 情绪检测

检测用户的情绪状态：

```python
def detect_user_mood(message):
    if /算了|为啥|做不到|不想|不行/.test(message):
        return 'frustrated'
    if /快|直接|马上|立刻|简单/.test(message):
        return 'impatient'
    if /原理|为什么|怎么|如何|是什么/.test(message):
        return 'curious'
    return 'neutral'
```

### 2. 模板匹配

#### 2.1 短回复模板

```python
short_replies = [
    '嗯', '好的', '行', '可以', '知道了', '了解',
    '继续', '启动', '查看', '搜索一下'
]
```

#### 2.2 问题回复模板

```python
question_replies = [
    '这个问题...', '让我想想', '嗯，怎么说呢',
    '简单来说', '本质上是', '关键是', '问题是'
]
```

#### 2.3 命令确认模板

```python
command_confirmations = [
    '好的，我来{action}',
    '行，{action}',
    '没问题，{action}',
    '可以，{action}',
    '我帮你{action}'
]
```

#### 2.4 情绪表达模板

```python
emotional_expressions = {
    'curious': ['有意思', '嗯？', '然后呢', '继续说', '详细说说'],
    'frustrated': ['算了', '行吧', '好吧', '没办法', '就这样吧'],
    'impatient': ['快点', '直接说', '简单点', '别废话', '重点'],
    'satisfied': ['不错', '好的', '可以', '行', '嗯嗯']
}
```

#### 2.5 技术讨论模板

```python
tech_discussion = [
    '这个技术...', '从原理上说', '底层是',
    '本质上是', '区别在于', '优势是', '问题是'
]
```

### 3. 回复生成

#### 3.1 问候回复

```python
def generate_greeting_reply(sender_name):
    greetings = ['嗯', '在', '说', '怎么了', '有事？', '嗨', '你好']
    return random.choice(greetings)
```

#### 3.2 命令回复

```python
def generate_command_reply(message):
    action_match = re.search(r'(帮我|查看|搜索|发我|启动|安装|下载|阅读|分析|测试|继续|重新|使用|操作)', message)
    action = action_match.group(1) if action_match else '处理'
    template = random.choice(command_confirmations)
    return template.replace('{action}', action)
```

#### 3.3 问题回复

```python
def generate_question_reply(message):
    return random.choice(question_replies)
```

#### 3.4 技术回复

```python
def generate_technical_reply(message):
    return random.choice(tech_discussion)
```

#### 3.5 情绪回复

```python
def generate_emotional_reply(message, mood):
    mood_templates = emotional_expressions.get(mood)
    if mood_templates:
        return random.choice(mood_templates)
    return random.choice(short_replies)
```

#### 3.6 链接回复

```python
def generate_link_reply(message):
    link_responses = ['看看', '我看看', '让我看看', '阅读一下', '分析一下']
    return random.choice(link_responses)
```

#### 3.7 默认回复

```python
def generate_default_reply(message):
    return random.choice(short_replies)
```

### 4. 风格修饰

#### 4.1 情绪调整

根据用户情绪调整回复：

```python
def apply_style_decorations(reply, mood):
    if mood == 'impatient':
        # 更直接
        reply = reply.replace('好的，', '').replace('没问题，', '')
    
    # 保持简洁
    if len(reply) > 50:
        reply = reply[:50]
    
    return reply
```

### 5. 持续学习

#### 5.1 模式学习

从新对话中学习用户模式：

```python
def learn_from_conversation(user_message, ai_reply):
    pattern = extract_pattern(user_message)
    user_patterns[pattern] = user_patterns.get(pattern, 0) + 1
```

#### 5.2 效果评估

评估AI回复的效果：

```python
def evaluate_reply_effectiveness(user_message, ai_reply, user_reaction):
    pattern = extract_patterns(user_message)[0]
    if pattern not in reply_effectiveness:
        reply_effectiveness[pattern] = {'success': 0, 'failure': 0}
    
    if user_reaction == 'positive':
        reply_effectiveness[pattern]['success'] += 1
    elif user_reaction == 'negative':
        reply_effectiveness[pattern]['failure'] += 1
```

## 输出格式

### 回复文本

根据消息类型和用户情绪生成回复文本。

### 置信度

根据匹配的知识节点和模板计算置信度。

### 使用的知识节点

列出在生成回复时使用的知识节点。

## 优化建议

1. **增加上下文记忆**: 当前只分析单条消息，可以考虑分析对话上下文
2. **增加个性化模板**: 当前使用通用模板，可以考虑为用户定制模板
3. **增加情感分析**: 当前情绪检测较简单，可以考虑使用情感分析模型
4. **增加知识融合**: 当前只使用知识图谱，可以考虑融合更多知识源
5. **增加回复评估**: 当前只评估效果，可以考虑优化回复策略
