#!/usr/bin/env python3
"""
数字分身 - 风格提取脚本

从对话记忆中提取风格特征，生成风格模型。
"""

import json
import os
import re
from collections import Counter
from typing import Dict, List, Any

class StyleExtractor:
    """风格提取器"""
    
    def __init__(self, memory_path: str, transcript_path: str):
        self.memory_path = memory_path
        self.transcript_path = transcript_path
        self.style = {
            'frequentWords': {},
            'techTerms': {},
            'humorStyle': 'dry',
            'expressionHabits': [],
            'sentencePatterns': [],
            'messagePatterns': {
                'commands': [],
                'questions': [],
                'greetings': [],
                'emotional': []
            },
            'messageLength': {
                'short': 0,
                'medium': 0,
                'long': 0
            },
            'messageTypes': {
                'commands': 0,
                'questions': 0,
                'statements': 0
            }
        }
        
        # 技术关键词
        self.tech_keywords = [
            'typescript', 'javascript', 'python', 'java', 'rust', 'go',
            'react', 'vue', 'docker', 'kubernetes', 'postgres', 'redis',
            'api', 'sdk', 'cli', 'git', 'npm', 'yarn', 'bun',
            'pi', 'agent', 'memory', 'extension', 'skill', 'gateway',
            'telegram', 'bot', 'server', 'client', 'database', 'cf',
            'cloudflare', 'github', 'websocket', 'http', 'ssh'
        ]
        
        # 命令模式
        self.command_patterns = [
            '帮我', '查看', '搜索', '发我', '启动', '安装', '下载',
            '阅读', '分析', '测试', '继续', '重新', '使用', '操作'
        ]
        
        # 问题模式
        self.question_patterns = [
            '什么', '怎么', '为什么', '如何', '可以', '能', '吗',
            '原理', '区别', '是什么', '干什么', '怎么做'
        ]
        
        # 情绪模式
        self.emotional_patterns = {
            'frustrated': ['算了', '为啥', '做不到', '不想', '不行'],
            'curious': ['原理', '为什么', '怎么', '如何'],
            'impatient': ['快', '直接', '马上', '立刻'],
            'casual': ['噢噢', '欧克', '好的', '行']
        }
    
    def load_messages(self) -> List[str]:
        """加载所有用户消息"""
        messages = []
        
        # 从会话记录加载
        if os.path.exists(self.transcript_path):
            for file_name in os.listdir(self.transcript_path):
                if file_name.endswith('.jsonl'):
                    file_path = os.path.join(self.transcript_path, file_name)
                    messages.extend(self._load_from_transcript(file_path))
        
        # 从记忆文件加载
        if os.path.exists(self.memory_path):
            messages.extend(self._load_from_memory(self.memory_path))
        
        return messages
    
    def _load_from_transcript(self, file_path: str) -> List[str]:
        """从会话记录加载消息"""
        messages = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        data = json.loads(line.strip())
                        if data.get('type') == 'user_message':
                            text = data.get('data', {}).get('text', '')
                            if text and len(text) > 1:
                                # 清洗消息
                                clean_text = text.split('\n[Concise')[0].strip()
                                clean_text = clean_text.split('\n[Document')[0].strip()
                                if len(clean_text) >= 2 and not clean_text.isdigit():
                                    messages.append(clean_text)
                    except:
                        pass
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
        return messages
    
    def _load_from_memory(self, memory_path: str) -> List[str]:
        """从记忆文件加载消息"""
        messages = []
        
        # 加载 consolidated.md
        consolidated_path = os.path.join(memory_path, 'consolidated.md')
        if os.path.exists(consolidated_path):
            with open(consolidated_path, 'r', encoding='utf-8') as f:
                messages.append(f.read())
        
        # 加载 pending.md
        pending_path = os.path.join(memory_path, 'pending.md')
        if os.path.exists(pending_path):
            with open(pending_path, 'r', encoding='utf-8') as f:
                messages.append(f.read())
        
        # 加载 daily/ 目录
        daily_path = os.path.join(memory_path, 'daily')
        if os.path.exists(daily_path):
            for file_name in sorted(os.listdir(daily_path))[-10:]:
                if file_name.endswith('.md'):
                    file_path = os.path.join(daily_path, file_name)
                    with open(file_path, 'r', encoding='utf-8') as f:
                        messages.append(f.read())
        
        return messages
    
    def extract_style(self, messages: List[str]) -> Dict[str, Any]:
        """提取风格特征"""
        word_counter = Counter()
        tech_counter = Counter()
        habits = []
        commands = []
        questions = []
        greetings = []
        emotional = []
        
        for msg in messages:
            lower_msg = msg.lower()
            
            # 词频统计
            words = re.findall(r'[\w\u4e00-\u9fff]+', lower_msg)
            for word in words:
                if len(word) > 1:
                    word_counter[word] += 1
            
            # 技术术语统计
            for term in self.tech_keywords:
                if term in lower_msg:
                    tech_counter[term] += 1
            
            # 命令模式
            for pattern in self.command_patterns:
                if pattern in msg:
                    commands.append(msg[:50])
                    break
            
            # 问题模式
            for pattern in self.question_patterns:
                if pattern in msg:
                    questions.append(msg[:50])
                    break
            
            # 问候模式
            if any(g in lower_msg for g in ['你好', '嗨', 'hi', 'hello', '在吗']):
                greetings.append(msg[:50])
            
            # 情绪模式
            for emotion, patterns in self.emotional_patterns.items():
                if any(p in msg for p in patterns):
                    emotional.append((emotion, msg[:50]))
                    break
            
            # 消息长度统计
            msg_len = len(msg)
            if msg_len < 20:
                self.style['messageLength']['short'] += 1
            elif msg_len < 100:
                self.style['messageLength']['medium'] += 1
            else:
                self.style['messageLength']['long'] += 1
            
            # 消息类型统计
            if any(p in msg for p in self.command_patterns):
                self.style['messageTypes']['commands'] += 1
            elif any(p in msg for p in self.question_patterns):
                self.style['messageTypes']['questions'] += 1
            else:
                self.style['messageTypes']['statements'] += 1
        
        # 更新风格
        self.style['frequentWords'] = dict(word_counter.most_common(30))
        self.style['techTerms'] = dict(tech_counter.most_common(20))
        self.style['messagePatterns']['commands'] = list(set(commands))[:10]
        self.style['messagePatterns']['questions'] = list(set(questions))[:10]
        self.style['messagePatterns']['greetings'] = list(set(greetings))[:5]
        self.style['messagePatterns']['emotional'] = emotional[:10]
        
        # 提取表达习惯
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
        
        for pattern, habit in habit_patterns:
            count = sum(1 for msg in messages if pattern in msg)
            if count > 0:
                habits.append(f"{habit}({count}次)")
        
        self.style['expressionHabits'] = habits
        
        # 提取句式模式
        start_patterns = Counter()
        for msg in messages:
            words = msg.split()
            if len(words) >= 2:
                start = ' '.join(words[:2])
                start_patterns[start] += 1
        
        self.style['sentencePatterns'] = [p for p, c in start_patterns.most_common(10)]
        
        return self.style
    
    def generate_description(self) -> str:
        """生成风格描述"""
        lines = []
        lines.append('## 说话风格分析')
        lines.append('')
        
        # 常用词汇
        lines.append('### 常用词汇 (Top 10)')
        for word, count in list(self.style['frequentWords'].items())[:10]:
            lines.append(f'- {word}: {count}次')
        
        # 技术术语
        lines.append('')
        lines.append('### 技术术语 (Top 10)')
        for term, count in list(self.style['techTerms'].items())[:10]:
            lines.append(f'- {term}: {count}次')
        
        # 消息长度分布
        lines.append('')
        lines.append('### 消息长度分布')
        total = sum(self.style['messageLength'].values())
        if total > 0:
            for length, count in self.style['messageLength'].items():
                percentage = count * 100 / total
                lines.append(f'- {length}: {count} ({percentage:.1f}%)')
        
        # 消息类型分布
        lines.append('')
        lines.append('### 消息类型分布')
        total = sum(self.style['messageTypes'].values())
        if total > 0:
            for msg_type, count in self.style['messageTypes'].items():
                percentage = count * 100 / total
                lines.append(f'- {msg_type}: {count} ({percentage:.1f}%)')
        
        # 表达习惯
        lines.append('')
        lines.append('### 表达习惯')
        for habit in self.style['expressionHabits']:
            lines.append(f'- {habit}')
        
        # 句式模式
        lines.append('')
        lines.append('### 常用句式开头')
        for pattern in self.style['sentencePatterns'][:5]:
            lines.append(f'- "{pattern}"')
        
        return '\n'.join(lines)
    
    def save(self, output_path: str):
        """保存风格数据"""
        os.makedirs(output_path, exist_ok=True)
        
        # 保存风格模型
        style_path = os.path.join(output_path, 'style-profile.json')
        with open(style_path, 'w', encoding='utf-8') as f:
            json.dump(self.style, f, ensure_ascii=False, indent=2)
        
        # 保存风格描述
        description_path = os.path.join(output_path, 'style-description.md')
        with open(description_path, 'w', encoding='utf-8') as f:
            f.write(self.generate_description())
        
        print(f"✅ 风格数据已保存到: {output_path}")
        print(f"   - {style_path}")
        print(f"   - {description_path}")

def main():
    """主函数"""
    # 配置路径
    memory_path = os.path.expanduser('~/.pi/roles/zero/memory')
    transcript_path = os.path.expanduser('~/.pi/gateway/sessions/transcripts')
    output_path = os.path.expanduser('~/.pi/agent/skills/digital-twin/data')
    
    print('🚀 开始提取风格特征...\n')
    
    # 创建提取器
    extractor = StyleExtractor(memory_path, transcript_path)
    
    # 加载消息
    print('📚 加载消息...')
    messages = extractor.load_messages()
    print(f'   加载了 {len(messages)} 条消息\n')
    
    # 提取风格
    print('🎭 提取风格特征...')
    style = extractor.extract_style(messages)
    
    # 显示结果
    print('\n### 常用词汇 (Top 10):')
    for word, count in list(style['frequentWords'].items())[:10]:
        print(f'  - {word}: {count}次')
    
    print('\n### 技术术语 (Top 10):')
    for term, count in list(style['techTerms'].items())[:10]:
        print(f'  - {term}: {count}次')
    
    print('\n### 消息长度分布:')
    total = sum(style['messageLength'].values())
    if total > 0:
        for length, count in style['messageLength'].items():
            percentage = count * 100 / total
            print(f'  - {length}: {count} ({percentage:.1f}%)')
    
    print('\n### 消息类型分布:')
    total = sum(style['messageTypes'].values())
    if total > 0:
        for msg_type, count in style['messageTypes'].items():
            percentage = count * 100 / total
            print(f'  - {msg_type}: {count} ({percentage:.1f}%)')
    
    print('\n### 表达习惯:')
    for habit in style['expressionHabits']:
        print(f'  - {habit}')
    
    # 保存数据
    print('\n💾 保存数据...')
    extractor.save(output_path)
    
    print('\n✅ 风格提取完成！')

if __name__ == '__main__':
    main()
