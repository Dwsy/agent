# Changelog

All notable changes to the ralph-loop-gen skill will be documented in this file.

## [2.0.0] - 2026-01-30

### Added

- **Python 生成脚本** (`generate.py`)
  - 支持从 JSON 配置文件生成任务
  - 自动计算批次和并行任务
  - 生成执行计划和依赖关系图
  - 支持项目目标追踪表格

- **增强的模板变量**
  - `{{GOALS_TABLE}}` - 项目目标表格
  - `{{EXECUTION_PLAN}}` - 执行计划
  - 更详细的任务索引模板

- **示例配置文件** (`examples/config-example.json`)
  - 完整的 JSON 配置示例
  - 包含 6 个示例任务
  - 展示目标追踪功能

- **改进的文档**
  - 更新 SKILL.md，添加更多使用说明
  - 重写 README.md，添加快速开始指南
  - 添加配置文件格式说明
  - 添加多 Agent 协作最佳实践

### Changed

- **任务索引模板**
  - 添加执行计划部分
  - 添加项目目标表格
  - 改进依赖关系图格式
  - 优化并行任务分组显示

- **任务模板**
  - 简化布局，提高可读性
  - 优化验收标准格式
  - 添加更清晰的说明文字

### Fixed

- 修复任务状态初始化问题（第一个任务应显示为 Locked）
- 修复依赖关系图显示问题
- 修复并行任务分组算法

## [1.0.0] - 2025-01-21

### Added

- 初始版本发布
- 支持 Bun 命令行交互式输入
- 基本任务模板生成
- 依赖关系图生成
- 并行任务分组
- 任务锁定机制文档
- 多 Agent 协作指南