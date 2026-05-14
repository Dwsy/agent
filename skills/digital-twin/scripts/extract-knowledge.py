#!/usr/bin/env python3
"""
数字分身 - 知识图谱构建脚本

从对话记忆中构建知识图谱，提取技术偏好、项目经验、决策历史。
"""

import json
import os
import re
from collections import Counter
from typing import Dict, List, Any

class KnowledgeGraphBuilder:
    """知识图谱构建器"""
    
    def __init__(self, memory_path: str):
        self.memory_path = memory_path
        self.graph = {
            'techPreferences': [],
            'projects': [],
            'decisions': [],
            'opinions': [],
            'techStack': {},
            'tools': {}
        }
    
    def load_memories(self) -> List[str]:
        """加载所有记忆"""
        memories = []
        
        # 加载 consolidated.md
        consolidated_path = os.path.join(self.memory_path, 'consolidated.md')
        if os.path.exists(consolidated_path):
            with open(consolidated_path, 'r', encoding='utf-8') as f:
                memories.append(f.read())
        
        # 加载 pending.md
        pending_path = os.path.join(self.memory_path, 'pending.md')
        if os.path.exists(pending_path):
            with open(pending_path, 'r', encoding='utf-8') as f:
                memories.append(f.read())
        
        # 加载 daily/ 目录
        daily_path = os.path.join(self.memory_path, 'daily')
        if os.path.exists(daily_path):
            for file_name in sorted(os.listdir(daily_path))[-10:]:
                if file_name.endswith('.md'):
                    file_path = os.path.join(daily_path, file_name)
                    with open(file_path, 'r', encoding='utf-8') as f:
                        memories.append(f.read())
        
        return memories
    
    def extract_knowledge(self, memories: List[str]) -> Dict[str, Any]:
        """提取知识"""
        tech_preferences = []
        projects = []
        decisions = []
        opinions = []
        tech_stack = Counter()
        tools = Counter()
        
        for memory in memories:
            # 技术偏好
            for match in re.finditer(r'偏好(.+)', memory):
                tech_preferences.append(match.group(1)[:100])
            for match in re.finditer(r'喜欢(.+)', memory):
                tech_preferences.append(match.group(1)[:100])
            for match in re.finditer(r'推荐(.+)', memory):
                tech_preferences.append(match.group(1)[:100])
            
            # 项目经验
            for match in re.finditer(r'项目[：:](.+)', memory):
                projects.append(match.group(1)[:100])
            for match in re.finditer(r'开发了(.+)', memory):
                projects.append(match.group(1)[:100])
            for match in re.finditer(r'实现了(.+)', memory):
                projects.append(match.group(1)[:100])
            
            # 决策历史
            for match in re.finditer(r'选择[了](.+)', memory):
                decisions.append(match.group(1)[:100])
            for match in re.finditer(r'采用了(.+)', memory):
                decisions.append(match.group(1)[:100])
            for match in re.finditer(r'放弃了(.+)', memory):
                decisions.append(match.group(1)[:100])
            
            # 观点态度
            for match in re.finditer(r'我认为(.+)', memory):
                opinions.append(match.group(1)[:100])
            for match in re.finditer(r'我觉得(.+)', memory):
                opinions.append(match.group(1)[:100])
            for match in re.finditer(r'本质上(.+)', memory):
                opinions.append(match.group(1)[:100])
            for match in re.finditer(r'关键是(.+)', memory):
                opinions.append(match.group(1)[:100])
            
            # 技术栈统计
            tech_keywords = [
                'typescript', 'javascript', 'python', 'java', 'rust', 'go',
                'react', 'vue', 'docker', 'kubernetes', 'postgres', 'redis',
                'api', 'sdk', 'cli', 'git', 'npm', 'yarn', 'bun',
                'pi', 'agent', 'memory', 'extension', 'skill', 'gateway'
            ]
            
            for keyword in tech_keywords:
                if keyword in memory.lower():
                    tech_stack[keyword] += 1
            
            # 工具统计
            tool_keywords = [
                'docker', 'kubernetes', 'nginx', 'redis', 'postgres',
                'git', 'npm', 'yarn', 'bun', 'webpack', 'vite',
                'eslint', 'prettier', 'jest', 'mocha', 'pytest'
            ]
            
            for tool in tool_keywords:
                if tool in memory.lower():
                    tools[tool] += 1
        
        # 更新图谱
        self.graph['techPreferences'] = list(set(tech_preferences))[:20]
        self.graph['projects'] = list(set(projects))[:20]
        self.graph['decisions'] = list(set(decisions))[:20]
        self.graph['opinions'] = list(set(opinions))[:20]
        self.graph['techStack'] = dict(tech_stack.most_common(20))
        self.graph['tools'] = dict(tools.most_common(20))
        
        return self.graph
    
    def generate_summary(self) -> str:
        """生成知识图谱摘要"""
        lines = []
        lines.append('## 知识图谱摘要')
        lines.append('')
        
        # 技术偏好
        lines.append('### 技术偏好')
        if self.graph['techPreferences']:
            for pref in self.graph['techPreferences'][:5]:
                lines.append(f'- {pref}')
        else:
            lines.append('- 暂无')
        
        # 项目经验
        lines.append('')
        lines.append('### 项目经验')
        if self.graph['projects']:
            for project in self.graph['projects'][:5]:
                lines.append(f'- {project}')
        else:
            lines.append('- 暂无')
        
        # 决策历史
        lines.append('')
        lines.append('### 决策历史')
        if self.graph['decisions']:
            for decision in self.graph['decisions'][:5]:
                lines.append(f'- {decision}')
        else:
            lines.append('- 暂无')
        
        # 观点态度
        lines.append('')
        lines.append('### 观点态度')
        if self.graph['opinions']:
            for opinion in self.graph['opinions'][:5]:
                lines.append(f'- {opinion}')
        else:
            lines.append('- 暂无')
        
        # 技术栈
        lines.append('')
        lines.append('### 技术栈')
        if self.graph['techStack']:
            for tech, count in list(self.graph['techStack'].items())[:10]:
                lines.append(f'- {tech}: {count}次')
        else:
            lines.append('- 暂无')
        
        # 工具
        lines.append('')
        lines.append('### 常用工具')
        if self.graph['tools']:
            for tool, count in list(self.graph['tools'].items())[:10]:
                lines.append(f'- {tool}: {count}次')
        else:
            lines.append('- 暂无')
        
        return '\n'.join(lines)
    
    def save(self, output_path: str):
        """保存知识图谱"""
        os.makedirs(output_path, exist_ok=True)
        
        # 保存知识图谱
        graph_path = os.path.join(output_path, 'knowledge-graph.json')
        with open(graph_path, 'w', encoding='utf-8') as f:
            json.dump(self.graph, f, ensure_ascii=False, indent=2)
        
        # 保存摘要
        summary_path = os.path.join(output_path, 'knowledge-summary.md')
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write(self.generate_summary())
        
        print(f"✅ 知识图谱已保存到: {output_path}")
        print(f"   - {graph_path}")
        print(f"   - {summary_path}")

def main():
    """主函数"""
    # 配置路径
    memory_path = os.path.expanduser('~/.pi/roles/zero/memory')
    output_path = os.path.expanduser('~/.pi/agent/skills/digital-twin/data')
    
    print('🚀 开始构建知识图谱...\n')
    
    # 创建构建器
    builder = KnowledgeGraphBuilder(memory_path)
    
    # 加载记忆
    print('📚 加载记忆...')
    memories = builder.load_memories()
    print(f'   加载了 {len(memories)} 条记忆\n')
    
    # 提取知识
    print('🧠 提取知识...')
    graph = builder.extract_knowledge(memories)
    
    # 显示结果
    print('\n### 技术偏好:')
    for pref in graph['techPreferences'][:5]:
        print(f'  - {pref}')
    
    print('\n### 项目经验:')
    for project in graph['projects'][:5]:
        print(f'  - {project}')
    
    print('\n### 决策历史:')
    for decision in graph['decisions'][:5]:
        print(f'  - {decision}')
    
    print('\n### 观点态度:')
    for opinion in graph['opinions'][:5]:
        print(f'  - {opinion}')
    
    print('\n### 技术栈:')
    for tech, count in list(graph['techStack'].items())[:5]:
        print(f'  - {tech}: {count}次')
    
    # 保存数据
    print('\n💾 保存数据...')
    builder.save(output_path)
    
    print('\n✅ 知识图谱构建完成！')

if __name__ == '__main__':
    main()
