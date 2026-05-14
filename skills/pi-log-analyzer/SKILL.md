---
name: pi-log-analyzer
description: Pi Agent 日志分析工具，用于分析 .log/ 目录下的结构化 JSONL 日志。支持按时间/角色/模块/模型多维分析，识别警告模式，生成可视化报告。当用户提到"分析日志"、"查看日志"、"日志统计"、"log分析"、"最近活动"、"模型使用"、"会话分析"时使用此技能。
---

# Pi Log Analyzer

分析 Pi Agent 的结构化日志（`.log/*.jsonl`），提供多维度统计和问题诊断。

## 日志格式

日志为 JSONL 格式，每行一个 JSON 对象：

```json
{
  "schema": "2.0.0",
  "timestamp": "2026-05-07T00:46:30.942Z",
  "level": "info|warn|error",
  "tag": "auto-extract|checkpoint|vector|...",
  "message": "日志消息",
  "context": {
    "role": "default|bw|psm|jly|zero",
    "sessionId": "uuid",
    "cwd": "/path",
    "pid": 12345
  },
  "meta": {
    "model": "provider/model-name",
    "duration_ms": 1234,
    ...
  },
  "traceId": "tr-xxx"
}
```

## 快速分析

### 基础统计

运行内置分析脚本：

```bash
python3 ~/.pi/agent/skills/pi-log-analyzer/scripts/analyze.py [目录路径] [天数]
```

参数：
- `目录路径`：日志目录，默认 `.log/`
- `天数`：分析最近 N 天，默认 3

示例：
```bash
# 分析最近 3 天
python3 ~/.pi/agent/skills/pi-log-analyzer/scripts/analyze.py

# 分析最近 7 天
python3 ~/.pi/agent/skills/pi-log-analyzer/scripts/analyze.py .log/ 7

# 分析指定目录
python3 ~/.pi/agent/skills/pi-log-analyzer/scripts/analyze.py /path/to/logs 5
```

### 输出内容

脚本生成以下分析：

1. **概览统计**：日志条数、会话数、时间跨度
2. **级别分布**：info/warn/error 数量和占比
3. **模块活跃度**：各 tag 出现频率
4. **角色活动**：各角色的日志量
5. **模型使用**：调用的模型及次数
6. **时间分布**：每小时活跃度热力图
7. **警告详情**：warn/error 的具体内容和模式

## 手动分析

如需更细致的分析，可用 Python 读取日志：

```python
import json
from collections import Counter

with open('.log/2026-05-09.jsonl') as f:
    for line in f:
        d = json.loads(line)
        # 访问字段：d['level'], d['tag'], d['meta']['model'], etc.
```

## 常见标签（tag）含义

| 标签 | 含义 |
|------|------|
| `auto-extract` | 自动记忆提取 |
| `checkpoint` | 定时保存点 |
| `daily-memory` | 每日记忆写入 |
| `vector` | 向量索引操作 |
| `pending` | 待处理项 |
| `repair` | 记忆修复 |
| `embedding` | 嵌入生成 |
| `knowledge` | 知识库操作 |

## 常见问题诊断

### auto-extract parse failed

**原因**：LLM 返回的记忆提取结果格式不符合预期

**典型模式**：
- 返回推理过程而非 JSON
- JSON 被截断
- 包含 `<think>` 标签

**建议**：
- 检查模型是否支持结构化输出
- 优先使用 DeepSeek V4 Flash（失败率最低）

### 模型调用失败

检查 `meta.model` 字段确认使用的模型，对比 `models.json` 配置。

## 使用场景

1. **日常巡检**：快速查看最近活动是否正常
2. **问题排查**：定位警告/错误的根因
3. **性能分析**：识别高负载时段和模块
4. **模型评估**：统计各模型使用量和成功率
5. **容量规划**：基于会话数和日志量预估资源
