#!/usr/bin/env python3
"""
Pi Agent 日志分析工具
分析 .log/ 目录下的结构化 JSONL 日志
"""

import json
import sys
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


def parse_args():
    """解析命令行参数"""
    log_dir = '.log/'
    days = 3
    
    if len(sys.argv) > 1:
        log_dir = sys.argv[1]
    if len(sys.argv) > 2:
        days = int(sys.argv[2])
    
    return log_dir, days


def get_log_files(log_dir, days):
    """获取最近 N 天的日志文件"""
    today = datetime.now()
    files = []
    
    for i in range(days):
        date = today - timedelta(days=i)
        date_str = date.strftime('%Y-%m-%d')
        
        # 尝试 .jsonl 和 .log 后缀
        for ext in ['.jsonl', '.log']:
            path = os.path.join(log_dir, f'{date_str}{ext}')
            if os.path.exists(path):
                files.append((path, date_str))
                break
    
    return sorted(files, key=lambda x: x[1])


def analyze_file(filepath, date_label):
    """分析单个日志文件"""
    levels = Counter()
    tags = Counter()
    roles = Counter()
    models = Counter()
    sessions = set()
    hourly = Counter()
    warnings = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            # 统计级别
            level = d.get('level', 'unknown')
            levels[level] += 1
            
            # 统计标签
            tag = d.get('tag', 'unknown')
            tags[tag] += 1
            
            # 上下文信息
            ctx = d.get('context', {})
            role = ctx.get('role', '-')
            if role != '-':
                roles[role] += 1
            
            session_id = ctx.get('sessionId', '')
            if session_id:
                sessions.add(session_id)
            
            # 时间分布
            timestamp = d.get('timestamp', '')
            if timestamp:
                try:
                    hour = int(timestamp[11:13])
                    hourly[hour] += 1
                except (ValueError, IndexError):
                    pass
            
            # 模型统计
            meta = d.get('meta', {})
            if isinstance(meta, dict):
                model = meta.get('model')
                if model:
                    models[model] += 1
            else:
                model = None
            
            # 收集警告
            if level in ('warn', 'error'):
                warnings.append({
                    'time': timestamp[:19] if timestamp else '?',
                    'tag': tag,
                    'message': d.get('message', '')[:100],
                    'model': model
                })
    
    return {
        'date': date_label,
        'total': sum(levels.values()),
        'sessions': len(sessions),
        'levels': levels,
        'tags': tags,
        'roles': roles,
        'models': models,
        'hourly': hourly,
        'warnings': warnings
    }


def format_bar(value, max_value, width=20):
    """生成文本柱状图"""
    if max_value == 0:
        return ''
    bar_len = int(value / max_value * width)
    return '█' * bar_len


def print_report(results):
    """打印分析报告"""
    print("=" * 70)
    print("📊 Pi Agent 日志分析报告")
    print("=" * 70)
    
    # 概览
    print("\n📈 概览统计")
    print("-" * 50)
    print(f"{'日期':<12} {'日志条数':>10} {'会话数':>8} {'警告数':>8}")
    print("-" * 50)
    
    total_logs = 0
    total_sessions = 0
    total_warnings = 0
    
    for r in results:
        warn_count = len(r['warnings'])
        print(f"{r['date']:<12} {r['total']:>10} {r['sessions']:>8} {warn_count:>8}")
        total_logs += r['total']
        total_sessions += r['sessions']
        total_warnings += warn_count
    
    print("-" * 50)
    print(f"{'合计':<12} {total_logs:>10} {total_sessions:>8} {total_warnings:>8}")
    
    # 级别分布
    all_levels = Counter()
    for r in results:
        all_levels.update(r['levels'])
    
    print("\n📊 日志级别分布")
    print("-" * 40)
    max_level = max(all_levels.values()) if all_levels else 1
    for level, count in all_levels.most_common():
        bar = format_bar(count, max_level)
        pct = count / total_logs * 100 if total_logs else 0
        print(f"  {level:<8} {count:>6} ({pct:5.1f}%) {bar}")
    
    # 模块活跃度
    all_tags = Counter()
    for r in results:
        all_tags.update(r['tags'])
    
    print("\n🏷️  模块活跃度 TOP 15")
    print("-" * 50)
    for tag, count in all_tags.most_common(15):
        pct = count / total_logs * 100 if total_logs else 0
        print(f"  {tag:<25} {count:>6} ({pct:5.1f}%)")
    
    # 角色活动
    all_roles = Counter()
    for r in results:
        all_roles.update(r['roles'])
    
    print("\n👤 角色活动统计")
    print("-" * 40)
    max_role = max(all_roles.values()) if all_roles else 1
    for role, count in all_roles.most_common():
        bar = format_bar(count, max_role, 15)
        print(f"  {role:<12} {count:>6} {bar}")
    
    # 模型使用
    all_models = Counter()
    for r in results:
        all_models.update(r['models'])
    
    if all_models:
        print("\n🤖 模型使用统计")
        print("-" * 60)
        total_model_calls = sum(all_models.values())
        for model, count in all_models.most_common(10):
            pct = count / total_model_calls * 100
            provider = model.split('/')[0] if '/' in model else 'other'
            print(f"  {model:<45} {count:>5} ({pct:5.1f}%)")
        
        # 提供商统计
        print("\n  提供商分布:")
        provider_count = Counter()
        for model, count in all_models.items():
            provider = model.split('/')[0] if '/' in model else 'other'
            provider_count[provider] += count
        
        for provider, count in provider_count.most_common():
            pct = count / total_model_calls * 100
            print(f"    {provider:<15} {count:>6} ({pct:5.1f}%)")
    
    # 时间分布（合并所有天）
    all_hourly = Counter()
    for r in results:
        all_hourly.update(r['hourly'])
    
    if all_hourly:
        print("\n⏰ 时间分布 (UTC)")
        print("-" * 50)
        max_hour = max(all_hourly.values()) if all_hourly else 1
        for hour in range(24):
            count = all_hourly.get(hour, 0)
            if count > 0:
                bar = format_bar(count, max_hour, 25)
                print(f"  {hour:02d}:00 {count:>5} {bar}")
    
    # 警告详情
    all_warnings = []
    for r in results:
        all_warnings.extend(r['warnings'])
    
    if all_warnings:
        print("\n⚠️  警告/错误分析")
        print("-" * 60)
        
        # 按标签分组
        warn_by_tag = Counter(w['tag'] for w in all_warnings)
        print("\n按模块统计:")
        for tag, count in warn_by_tag.most_common():
            print(f"  {tag:<25} {count:>3}")
        
        # 按模型分组
        warn_by_model = Counter(w['model'] for w in all_warnings if w['model'])
        if warn_by_model:
            print("\n按模型统计:")
            for model, count in warn_by_model.most_common():
                print(f"  {model:<45} {count:>3}")
        
        # 显示前 10 条警告
        print(f"\n最近 {min(10, len(all_warnings))} 条警告:")
        for w in all_warnings[-10:]:
            print(f"  [{w['time']}] {w['tag']}: {w['message']}")
    
    print("\n" + "=" * 70)


def main():
    """主函数"""
    log_dir, days = parse_args()
    
    # 检查目录
    if not os.path.isdir(log_dir):
        print(f"错误: 目录不存在 {log_dir}")
        sys.exit(1)
    
    # 获取文件列表
    files = get_log_files(log_dir, days)
    
    if not files:
        print(f"未找到最近 {days} 天的日志文件")
        sys.exit(1)
    
    print(f"分析 {len(files)} 个日志文件...")
    
    # 分析每个文件
    results = []
    for filepath, date_label in files:
        result = analyze_file(filepath, date_label)
        results.append(result)
    
    # 输出报告
    print_report(results)


if __name__ == '__main__':
    main()
