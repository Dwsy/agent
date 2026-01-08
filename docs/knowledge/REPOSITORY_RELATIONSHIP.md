# Repository Relationship Documentation

## 🔗 两个仓库的关联关系

### 1. 核心关系

```
Knowledge Builder Extension
        ↓ 依赖
Knowledge Base Skill
```

**Knowledge Builder Extension** 是一个自动化层，它调用 **Knowledge Base Skill** 的命令来构建知识库。

---

## 📊 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Builder Extension                │
│                    (自动化层 / AI 驱动)                        │
│                                                              │
│  功能：                                                      │
│  - Ralph Loop 多迭代开发                                    │
│  - 自然语言接口                                              │
│  - AI 决策和执行                                            │
│  - 状态管理                                                  │
│                                                              │
│  调用的命令：                                                │
│  - bun ~/.pi/agent/skills/knowledge-base/lib.ts scan       │
│  - bun ~/.pi/agent/skills/knowledge-base/lib.ts discover   │
│  - bun ~/.pi/agent/skills/knowledge-base/lib.ts create ...  │
│  - bun ~/.pi/agent/skills/knowledge-base/lib.ts index      │
│  - bun ~/.pi/agent/skills/knowledge-base/lib.ts search     │
└─────────────────────────────────────────────────────────────┘
                              ↓
                              │ 依赖
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Knowledge Base Skill                      │
│                      (核心引擎 / 功能层)                        │
│                                                              │
│  功能：                                                      │
│  - 多级目录分类 (无限深度)                                  │
│  - 项目结构发现 (15种技术目录)                              │
│  - 文档创建 (Concept, Guide, Decision)                       │
│  - 索引生成                                                  │
│  - 全文搜索                                                  │
│  - 自然语言重组                                              │
│                                                              │
│  提供的命令：                                                │
│  - init: 初始化知识库                                        │
│  - scan: 扫描代码                                            │
│  - discover: 发现项目结构                                    │
│  - create: 创建文档                                          │
│  - index: 生成索引                                           │
│  - search: 搜索知识                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 功能分工

| 维度 | Knowledge Base Skill | Knowledge Builder Extension |
|------|---------------------|---------------------------|
| **角色** | 核心引擎 | 自动化层 |
| **使用方式** | 手动执行命令 | AI 自动执行 |
| **输入** | 命令行参数 | 自然语言描述 |
| **输出** | 执行结果 | 完整知识库 |
| **适用场景** | 小型项目、精细控制 | 大型项目、自动化 |
| **学习曲线** | 简单 | 需要理解 AI 行为 |

---

## 📦 安装顺序

### 必须先安装 Knowledge Base Skill

```bash
# 1. 安装 Knowledge Base Skill
git clone https://github.com/Dwsy/knowledge-base-skill.git
cd knowledge-base-skill

# 2. 在项目中初始化
cd /path/to/your/project
bun ~/.pi/agent/skills/knowledge-base/lib.ts init

# 3. 然后安装 Knowledge Builder Extension
git clone https://github.com/Dwsy/knowledge-builder-extension.git
cd knowledge-builder-extension
chmod +x *.sh

# 4. 使用 Knowledge Builder
knowledge-builder "Build knowledge base" --tmux -m 100
```

---

## 🚀 使用模式对比

### 模式 1: 手动使用 Knowledge Base Skill

```bash
cd /path/to/project

# 1. 初始化
bun ~/.pi/agent/skills/knowledge-base/lib.ts init

# 2. 发现项目结构
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover

# 3. 查看建议
cat docs/knowledge/discovery_report.md

# 4. 手动创建文档
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "API" backend

# 5. 生成索引
bun ~/.pi/agent/skills/knowledge-base/lib.ts index
```

**适用场景**:
- 小型项目
- 需要精细控制
- 学习如何使用
- 快速文档更新

### 模式 2: 自动使用 Knowledge Builder Extension

```bash
cd /path/to/project

# 1. 初始化
bun ~/.pi/agent/skills/knowledge-base/lib.ts init

# 2. 运行 Builder
knowledge-builder "Build a comprehensive knowledge base" --tmux -m 100

# 3. 监控进度
knowledge-builder-manager status

# 4. 查看结果
tree docs/knowledge
```

**适用场景**:
- 大型项目
- 需要自动化
- 过夜任务
- 复杂文档需求

### 模式 3: 混合使用（推荐）

```bash
cd /path/to/project

# 1. 初始化和发现
bun ~/.pi/agent/skills/knowledge-base/lib.ts init
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover

# 2. 使用 Builder 生成核心文档
knowledge-builder "Document core components" --tmux -m 50

# 3. 手动添加专业文档
bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision "KeyDecision" category

# 4. 使用自然语言重组
# 告诉 AI: "重新组织文档结构"

# 5. 生成最终索引
bun ~/.pi/agent/skills/knowledge-base/lib.ts index
```

**适用场景**:
- 中大型项目
- 需要自动化但也要精细控制
- 复杂文档需求
- 最佳平衡

---

## 🔗 代码层面关联

### Knowledge Builder Extension 如何调用 Skill

在 `knowledge-builder.sh` 中，AI 会生成并执行以下命令：

```bash
# AI 决策后执行的命令示例
bun ~/.pi/agent/skills/knowledge-base/lib.ts scan
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "UserAuthentication" auth
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "HowToLogin" auth
bun ~/.pi/agent/skills/knowledge-base/lib.ts index
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "auth"
```

### 命令映射

| Builder 动作 | Skill 命令 | 说明 |
|-------------|-----------|------|
| 扫描代码 | `scan` | 识别类名、接口名 |
| 发现结构 | `discover` | 识别技术目录 |
| 创建概念 | `create concept` | 创建概念文档 |
| 创建指南 | `create guide` | 创建指南文档 |
| 创建决策 | `create decision` | 创建决策文档 |
| 生成索引 | `index` | 更新知识库索引 |
| 搜索知识 | `search` | 查找现有文档 |

---

## 📊 数据流

```
用户输入
  ↓
Knowledge Builder Extension
  - AI 分析需求
  - AI 决策下一步
  ↓
Knowledge Base Skill 命令
  - 执行具体操作
  - 返回结果
  ↓
更新状态
  - 记录进度
  - 检查完成
  ↓
重复直到完成
```

---

## 🎯 协同优势

### 1. 分离关注点
- **Skill**: 专注于知识库管理的具体功能
- **Builder**: 专注于自动化和 AI 决策

### 2. 灵活性
- 可以单独使用 Skill 进行手动管理
- 可以使用 Builder 进行自动化
- 可以混合使用两者

### 3. 可维护性
- Skill 更新不影响 Builder
- Builder 更新不影响 Skill
- 两者可以独立演进

### 4. 可测试性
- Skill 可以独立测试每个命令
- Builder 可以测试整体流程
- 互相验证

---

## 🔄 版本兼容性

| KB Skill 版本 | Builder Extension 版本 | 兼容性 |
|--------------|----------------------|--------|
| v1.0.0 | v1.0.0 | ✅ 完全兼容 |
| v1.0.0 | v1.1.0 | ✅ 向后兼容 |
| v1.1.0 | v1.0.0 | ⚠️ 部分兼容 |
| v1.1.0 | v1.1.0 | ✅ 完全兼容 |

---

## 📝 文档关联

### Knowledge Base Skill README
包含对 Knowledge Builder Extension 的引用：
```markdown
## 相关项目
- **[Knowledge Builder Extension](https://github.com/Dwsy/knowledge-builder-extension)**
  使用自然语言和 AI 自动构建知识库的扩展工具
```

### Knowledge Builder Extension README
包含对 Knowledge Base Skill 的依赖说明：
```markdown
## 依赖
**Requires**: [Knowledge Base Skill](https://github.com/Dwsy/knowledge-base-skill)
```

---

## 🚀 未来集成计划

### v1.1.0
- [ ] Builder 自动检测 Skill 版本
- [ ] 版本兼容性检查
- [ ] 自动更新提示

### v1.2.0
- [ ] 统一配置文件
- [ ] 共享模板系统
- [ ] 联合测试套件

### v2.0.0
- [ ] 单一安装包
- [ ] 统一 CLI 工具
- [ ] Web UI 集成

---

## 🎊 总结

### 关键点

1. **依赖关系**: Builder 依赖 Skill
2. **功能分工**: Skill 提供功能，Builder 提供自动化
3. **使用模式**: 可以单独使用、混合使用
4. **相互引用**: README 中已添加相互引用
5. **独立演进**: 两个仓库可以独立维护和更新

### 最佳实践

1. ✅ 先安装 Knowledge Base Skill
2. ✅ 理解两者的功能分工
3. ✅ 根据项目规模选择使用模式
4. ✅ 小项目用 Skill，大项目用 Builder
5. ✅ 复杂项目用混合模式

---

**关系**: ✅ 强关联，依赖关系清晰

**状态**: ✅ 已在 README 中相互引用

**兼容性**: ✅ v1.0.0 完全兼容

---

**最后更新**: 2026-01-07