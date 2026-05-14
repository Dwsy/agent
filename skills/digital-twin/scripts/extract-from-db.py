"""
数字分身 - 从 sessions.db 提取用户风格
"""
import sqlite3
import json
import re
import os
from collections import Counter
from typing import Dict, List, Any

DB_PATH = os.path.expanduser("~/.pi/agent/sessions/sessions.db")
OUTPUT_DIR = os.path.expanduser("~/.pi/agent/skills/digital-twin/data")

# 中文停用词
STOPWORDS = set("的了是在我有不这人个大为上中要他来用到说出就会可对生那和也子时道作自之去过下都你们好还让把与被从没很其此它又如样等看给着没她两起已经前面对就是可以需要应该能够可能如果因为所以但是然后这个那个什么怎么为什么如何".split())

# 技术关键词
TECH_KEYWORDS = {
    'typescript', 'javascript', 'python', 'java', 'rust', 'go', 'vue', 'react',
    'docker', 'kubernetes', 'postgres', 'redis', 'mysql', 'nginx', 'api', 'sdk',
    'cli', 'git', 'npm', 'pnpm', 'bun', 'node', 'pi', 'agent', 'memory',
    'extension', 'skill', 'gateway', 'telegram', 'bot', 'server', 'client',
    'websocket', 'http', 'ssh', 'sql', 'json', 'html', 'css', 'vite', 'webpack',
    'spring', 'mybatis', 'vue3', 'typescript', 'vite', 'univer', 'element',
    'ant-design', 'tailwind', 'unocss', 'maven', 'gradle', 'docker-compose',
    'cloudflare', 'github', 'gitlab', 'pr', 'mr', 'ci', 'cd', 'devops',
    'microservice', 'monorepo', 'turborepo', 'lerna', 'bpm', 'workflow',
    'erp', 'cms', 'crm', 'hrm', 'oa', 'pms', 'ams', 'ecs', 'rms'
}

# 情绪模式
EMOTIONAL_PATTERNS = {
    'frustrated': ['算了', '为啥', '不行', '搞什么', '你在干啥', '你在干什么', '服了', '烦躁', '你能不能', '你好傻', '傻逼'],
    'curious': ['原理', '为什么', '怎么', '如何', '是什么', '区别', '是什么原理'],
    'impatient': ['快', '直接', '马上', '继续', '不要停', '别停'],
    'satisfied': ['ok', '可以', '行', '好的', '不错', '完美', '牛', '厉害'],
    'directive': ['需要', '要求', '必须', '应该', '不要', '不允许', '禁止'],
}

# 命令模式
COMMAND_PATTERNS = ['帮我', '查看', '搜索', '分析', '测试', '启动', '安装', '下载', '部署', '提交', '继续', '扫描', '修改', '添加', '删除', '创建', '实现', '优化', '重构', '深度']

# 问题模式
QUESTION_PATTERNS = ['什么', '怎么', '为什么', '如何', '可以', '能', '吗', '原理', '区别', '是什么', '怎么做', '怎么回事']


def load_user_messages(limit=0):
    """从 DB 加载用户消息"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    query = """
        SELECT content, timestamp, session_path
        FROM message_entries
        WHERE role = 'user' AND source_type = 'user'
        ORDER BY timestamp DESC
        LIMIT 10000
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for content, ts, sp in rows:
        # 清洗
        text = content.strip()
        # 移除系统标签和XML标签
        text = re.sub(r'\[Concise Output Mode\]', '', text)
        text = re.sub(r'\[Document.*?\]', '', text)
        text = re.sub(r'<skill.*?</skill>', '', text, flags=re.DOTALL)
        text = re.sub(r'<reminder>.*?</reminder>', '', text, flags=re.DOTALL)
        text = re.sub(r'<AGENTS\.md>.*?</AGENTS\.md>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>[^<]*</[^>]+>', '', text)
        # 移除代码块
        text = re.sub(r'```[\s\S]*?```', '', text)
        text = re.sub(r'`[^`]+`', '', text)
        # 移除堆栈跟踪和日志
        text = re.sub(r'at [a-zA-Z_$]+\.[a-zA-Z_$]+\(.*?\)', '', text)
        text = re.sub(r'\tat .*', '', text)
        text = re.sub(r'(Exception|Error|WARN|INFO|DEBUG|TRACE).*', '', text)
        text = re.sub(r'.*\.java:\d+', '', text)
        text = re.sub(r'.*\.ts:\d+', '', text)
        text = re.sub(r'.*\.js:\d+', '', text)
        # 移除 import/package 声明
        text = re.sub(r'^(import|package|from|export) .*', '', text)
        # 移除纯代码行
        text = re.sub(r'^(public|private|protected|class|interface|function|const|let|var|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|this|super|extends|implements) .*', '', text)
        # 移除URL和路径（保留有意义的）
        text = re.sub(r'https?://[^\s]+', '[URL]', text)
        text = re.sub(r'/[a-zA-Z_/.-]+\.(java|ts|js|py|json|xml|yml|yaml|md|sql)', '', text)
        # 移除SQL片段
        text = re.sub(r'(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP) .*', '', text, flags=re.IGNORECASE)
        # 移除JSON/XML片段
        text = re.sub(r'^\s*[\{\[<]', '', text)
        text = re.sub(r'[\}\]>]\s*$', '', text)
        text = text.strip()
        
        # 过滤条件：至少2字符，不是纯数字，不是纯代码
        if len(text) >= 2 and not text.isdigit():
            # 进一步过滤：如果消息中代码特征过多，跳过
            code_indicators = len(re.findall(r'[{}();=<>]', text))
            if code_indicators > len(text) * 0.3:
                continue
            messages.append({'text': text, 'timestamp': ts, 'session': sp})
    
    return messages


def extract_style(messages: List[Dict]) -> Dict[str, Any]:
    """提取风格特征"""
    texts = [m['text'] for m in messages]
    
    # === 词汇分析 ===
    all_words = []
    tech_counts = Counter()
    
    for text in texts:
        # 提取中文词（简单分词：2-4字）
        cn_words = re.findall(r'[\u4e00-\u9fff]{2,4}', text)
        all_words.extend(cn_words)
        
        # 提取英文词
        en_words = re.findall(r'[a-zA-Z][a-zA-Z0-9_-]+', text.lower())
        all_words.extend(en_words)
        
        # 技术术语
        text_lower = text.lower()
        for kw in TECH_KEYWORDS:
            if kw in text_lower:
                tech_counts[kw] += 1
    
    # 过滤停用词并统计
    word_counts = Counter()
    for w in all_words:
        if w not in STOPWORDS and len(w) >= 2:
            word_counts[w] += 1
    
    # === 消息长度 ===
    lengths = [len(t) for t in texts]
    short = sum(1 for l in lengths if l < 20)
    medium = sum(1 for l in lengths if 20 <= l < 80)
    long_ = sum(1 for l in lengths if l >= 80)
    
    # === 消息类型 ===
    cmd_count = 0
    q_count = 0
    stmt_count = 0
    for text in texts:
        is_cmd = any(text.startswith(p) or p in text[:10] for p in COMMAND_PATTERNS)
        is_q = any(p in text for p in QUESTION_PATTERNS) or text.endswith('？') or text.endswith('?')
        if is_cmd:
            cmd_count += 1
        elif is_q:
            q_count += 1
        else:
            stmt_count += 1
    
    # === 情绪分析 ===
    emotion_counts = Counter()
    for text in texts:
        for emotion, patterns in EMOTIONAL_PATTERNS.items():
            for p in patterns:
                if p in text:
                    emotion_counts[emotion] += 1
                    break
    
    # === 表达习惯 ===
    habits = Counter()
    habit_patterns = {
        '极简指令': lambda t: len(t) < 10 and any(p in t for p in ['继续', '好', '行', '可以', 'ok']),
        '追问原因': lambda t: any(p in t for p in ['为什么', '为啥', '怎么回事', '什么原因']),
        '直接命令': lambda t: any(t.startswith(p) for p in ['帮我', '查看', '搜索', '分析', '测试', '部署', '提交', '扫描']),
        '需求描述': lambda t: t.startswith('需求') or '需求' in t[:5],
        '深度研究': lambda t: '深度' in t and any(p in t for p in ['研究', '分析', '理解']),
        '否定纠正': lambda t: any(p in t for p in ['不是', '不要', '不对', '不行', '还是不行']),
        '确认验收': lambda t: any(p in t for p in ['确认', '看看', '检查', '测试一下', '验证']),
        '情绪表达': lambda t: any(p in t for p in ['你在干啥', '你在干什么', '搞什么', '服了', '烦躁']),
    }
    
    for text in texts:
        for habit_name, check in habit_patterns.items():
            if check(text):
                habits[habit_name] += 1
    
    # === 句式开头 ===
    start_patterns = Counter()
    for text in texts:
        # 取前6个字符作为开头模式
        start = text[:6].strip()
        if len(start) >= 2:
            start_patterns[start] += 1
    
    # === 常用标点 ===
    punct_counts = Counter()
    for text in texts:
        for p in ['？', '！', '。', '，', '；', '、', '...', '？？', '！！']:
            punct_counts[p] += text.count(p)
    
    # === 长度统计 ===
    avg_len = sum(lengths) / len(lengths) if lengths else 0
    
    return {
        'totalMessages': len(texts),
        'frequentWords': dict(word_counts.most_common(30)),
        'techTerms': dict(tech_counts.most_common(20)),
        'messageLength': {
            'short': short,
            'medium': medium,
            'long': long_,
            'avgChars': round(avg_len, 1),
        },
        'messageTypes': {
            'commands': cmd_count,
            'questions': q_count,
            'statements': stmt_count,
        },
        'emotions': dict(emotion_counts.most_common()),
        'habits': dict(habits.most_common()),
        'sentenceStarts': [p for p, _ in start_patterns.most_common(20)],
        'punctuation': dict(punct_counts.most_common()),
        'sampleMessages': {
            'short': [t for t in texts if len(t) < 10][:10],
            'commands': [t for t in texts if any(t.startswith(p) for p in COMMAND_PATTERNS)][:10],
            'questions': [t for t in texts if any(p in t for p in QUESTION_PATTERNS) or t.endswith('？')][:10],
            'emotional': [t for t in texts if any(p in t for p in ['你在干啥', '你在干什么', '搞什么', '服了', '烦躁', '算了', '为啥', '你好傻'])][:10],
            'long': sorted(texts, key=len, reverse=True)[:5],
        }
    }


def generate_description(style: Dict) -> str:
    """生成风格描述"""
    lines = []
    lines.append('# Dwsy 数字分身 · 风格提取报告')
    lines.append('')
    lines.append(f'> 基于 {style["totalMessages"]} 条真实用户消息提取')
    lines.append('')
    
    # 人格画像
    lines.append('## 🎭 人格画像')
    lines.append('')
    total = style['totalMessages']
    cmd_pct = style['messageTypes']['commands'] / total * 100
    q_pct = style['messageTypes']['questions'] / total * 100
    s_pct = style['messageTypes']['statements'] / total * 100
    
    lines.append(f'**消息类型分布：**')
    lines.append(f'- 🎯 命令/指令型：{cmd_pct:.1f}% — 直接下达任务，不废话')
    lines.append(f'- ❓ 提问/探索型：{q_pct:.1f}% — 追问原理、设计、架构')
    lines.append(f'- 💬 陈述/讨论型：{s_pct:.1f}% — 描述需求、确认结果')
    lines.append('')
    
    # 沟通风格
    lines.append('## 💬 沟通风格')
    lines.append('')
    lines.append('### 核心特征')
    lines.append('')
    lines.append('**1. 极简指令型**')
    lines.append('- 短消息占主导，平均消息长度很短')
    lines.append('- 典型句式：「继续」「查看」「扫描」「分析」「测试」「部署」')
    lines.append('- 不做多余铺垫，直接给任务')
    lines.append('')
    lines.append('**2. 技术导向**')
    lines.append('- 高频技术术语：' + ', '.join(list(style['techTerms'].keys())[:10]))
    lines.append('- 关注架构、设计模式、系统原理')
    lines.append('- 喜欢「深度研究」「深度分析」')
    lines.append('')
    lines.append('**3. 直言不讳**')
    lines.append('- 不满意时直接说：「你在干啥」「你在干什么」「搞什么」「服了」')
    lines.append('- 纠错时直接否定：「不是」「不要」「不对」「还是不行」')
    lines.append('- 不做作，不客套')
    lines.append('')
    lines.append('**4. 结果导向**')
    lines.append('- 关注「确认」「验证」「测试」')
    lines.append('- 要求「简洁」「直接」「不需要XX」')
    lines.append('- 「push就行了」「提交到git」「部署到服务器」')
    lines.append('')
    
    # 情绪特征
    lines.append('## 😤 情绪特征')
    lines.append('')
    for emotion, count in style['emotions'].items():
        emoji_map = {'frustrated': '😤', 'curious': '🤔', 'impatient': '⚡', 'satisfied': '😊', 'directive': '🎯'}
        emoji = emoji_map.get(emotion, '🔹')
        lines.append(f'- {emoji} {emotion}: {count}次')
    lines.append('')
    
    # 表达习惯
    lines.append('## 🗣️ 表达习惯')
    lines.append('')
    for habit, count in style['habits'].items():
        lines.append(f'- **{habit}**: {count}次')
    lines.append('')
    
    # 消息长度
    lines.append('## 📏 消息长度分布')
    lines.append('')
    ml = style['messageLength']
    lines.append(f'- 短消息 (<20字): {ml["short"]} ({ml["short"]/total*100:.1f}%)')
    lines.append(f'- 中消息 (20-80字): {ml["medium"]} ({ml["medium"]/total*100:.1f}%)')
    lines.append(f'- 长消息 (>80字): {ml["long"]} ({ml["long"]/total*100:.1f}%)')
    lines.append(f'- 平均长度: {ml["avgChars"]} 字符')
    lines.append('')
    
    # 高频词汇
    lines.append('## 📝 高频词汇 Top 20')
    lines.append('')
    for word, count in list(style['frequentWords'].items())[:20]:
        lines.append(f'- `{word}`: {count}')
    lines.append('')
    
    # 技术术语
    lines.append('## 🔧 技术术语 Top 15')
    lines.append('')
    for term, count in list(style['techTerms'].items())[:15]:
        lines.append(f'- `{term}`: {count}')
    lines.append('')
    
    # 常用标点
    lines.append('## ✏️ 标点习惯')
    lines.append('')
    for p, count in style['punctuation'].items():
        lines.append(f'- `{p}`: {count}次')
    lines.append('')
    
    # 典型消息样本
    lines.append('## 📋 典型消息样本')
    lines.append('')
    
    lines.append('### 极简指令')
    for msg in style['sampleMessages']['short']:
        lines.append(f'- 「{msg}」')
    lines.append('')
    
    lines.append('### 任务下达')
    for msg in style['sampleMessages']['commands']:
        lines.append(f'- 「{msg}」')
    lines.append('')
    
    lines.append('### 提问探索')
    for msg in style['sampleMessages']['questions']:
        lines.append(f'- 「{msg}」')
    lines.append('')
    
    lines.append('### 情绪爆发')
    for msg in style['sampleMessages']['emotional']:
        lines.append(f'- 「{msg}」')
    lines.append('')
    
    # 风格总结
    lines.append('## 🎯 分身风格总结')
    lines.append('')
    lines.append('> Dwsy 是一个**极简主义的技术领导者**。')
    lines.append('> 沟通风格直接、高效，不废话。')
    lines.append('> 对代码质量有高要求，对低容忍度的行为直接表达不满。')
    lines.append('> 喜欢深度研究架构和原理，而非表面实现。')
    lines.append('> 结果导向：「能跑就行」不是他的风格，「正确且优雅」才是。')
    lines.append('> 情绪真实：不满意就说，满意也说，不装。')
    lines.append('')
    lines.append('### 说话模板')
    lines.append('')
    lines.append('```')
    lines.append('下达任务: 「{动词} {对象}」「需求 {描述}」')
    lines.append('追问: 「为什么 {现象}？」「原理是什么？」')
    lines.append('否定: 「不是」「不要 {X}」「还是不行」')
    lines.append('确认: 「看看」「确认」「测试一下」')
    lines.append('情绪: 「你在干啥」「搞什么」「算了」')
    lines.append('简洁: 「继续」「ok」「行」「直接 {动词}」')
    lines.append('```')
    
    return '\n'.join(lines)


def main():
    print('🚀 从 sessions.db 提取 Dwsy 风格...\n')
    
    # 加载
    print('📚 加载用户消息...')
    messages = load_user_messages()
    print(f'   加载了 {len(messages)} 条消息\n')
    
    # 提取
    print('🎭 提取风格特征...')
    style = extract_style(messages)
    
    # 保存
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    style_path = os.path.join(OUTPUT_DIR, 'style-profile.json')
    with open(style_path, 'w', encoding='utf-8') as f:
        json.dump(style, f, ensure_ascii=False, indent=2)
    
    desc_path = os.path.join(OUTPUT_DIR, 'style-description.md')
    desc = generate_description(style)
    with open(desc_path, 'w', encoding='utf-8') as f:
        f.write(desc)
    
    print(f'\n✅ 保存完成:')
    print(f'   - {style_path}')
    print(f'   - {desc_path}')
    
    # 输出摘要
    total = style['totalMessages']
    print(f'\n📊 摘要:')
    print(f'   总消息: {total}')
    print(f'   平均长度: {style["messageLength"]["avgChars"]} 字符')
    print(f'   命令型: {style["messageTypes"]["commands"]} ({style["messageTypes"]["commands"]/total*100:.1f}%)')
    print(f'   提问型: {style["messageTypes"]["questions"]} ({style["messageTypes"]["questions"]/total*100:.1f}%)')
    print(f'   陈述型: {style["messageTypes"]["statements"]} ({style["messageTypes"]["statements"]/total*100:.1f}%)')
    print(f'\n   Top 5 技术术语:')
    for term, count in list(style['techTerms'].items())[:5]:
        print(f'     {term}: {count}')


if __name__ == '__main__':
    main()
