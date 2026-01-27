# Pi Agent 代理使用示例

本文档展示如何使用更新后的代理系统，包括只读模式、五阶段计划模式和安全审查。

## 1. Scout 代理（只读模式）

### 基础用法

```javascript
// 查找认证相关代码
subagent({
  agent: "scout",
  task: "查找认证相关的代码实现，包括登录、注册、会话管理"
})
```

### 预期输出

```markdown
## Files Retrieved
1. `src/auth/auth.service.ts` (10-80行) - 认证服务实现
2. `src/auth/auth.controller.ts` (1-50行) - 认证控制器
3. `src/middleware/auth.middleware.ts` (1-40行) - JWT 中间件

## Key Code

```typescript
interface UserCredentials {
  email: string;
  password: string;
}

async function login(credentials: UserCredentials): Promise<AuthToken> {
  // Implementation
}
```

## Architecture
认证流程：Controller → Service → Repository → Database
JWT 验证通过中间件实现

## Where to Start
从 `src/auth/auth.service.ts` 开始，这是核心认证逻辑
```

## 2. Planner 代理（五阶段计划模式）

### 完整工作流示例

```javascript
// 用户请求：添加用户头像上传功能

// Phase 1: Context Discovery (并行探索)
subagent({
  tasks: [
    { agent: "scout", task: "查找现有的用户模型和数据库 schema" },
    { agent: "scout", task: "查找现有的文件上传功能实现" },
    { agent: "scout", task: "查找 AWS S3 或云存储配置" }
  ]
})

// Phase 2: Design (方案设计)
subagent({
  agent: "planner",
  task: `
    基于 Phase 1 探索结果：

    Files Found:
    - src/models/user.ts (10-50行) - 用户模型
    - src/services/upload.service.ts - 文件上传服务
    - src/config/storage.ts - S3 配置

    User Requirements:
    - 用户可以上传头像
    - 图片需要裁剪和压缩
    - 支持多种格式（jpg, png, webp）
    - 图片大小限制在 5MB 以内

    Constraints:
    - 必须使用现有的 S3 配置
    - 不能修改现有用户表结构
    - 需要添加图片验证

    设计详细的实现计划，包括：
    1. 方案选择和权衡
    2. 分步实现序列
    3. 需要修改的文件
    4. 验证策略
    5. 风险评估
  `
})

// Phase 3: Review & Alignment (审查与对齐)
// 读取关键文件验证假设
read("src/models/user.ts")
read("src/services/upload.service.ts")

// 如有歧义，使用 interview 工具澄清
interview({
  questions: [
    {
      id: "q1",
      type: "single",
      question: "头像是否需要作为用户表的字段，还是使用单独的关联表？",
      options: ["用户表字段", "单独关联表", "不存储，仅上传到 S3"]
    }
  ]
})

// Phase 4: Final Plan (最终计划)
// 写入计划文件（唯一允许编辑的文件）
write("PLAN.md", `
# Implementation Plan

## Approach
使用现有的 S3 上传服务，在用户表中添加 avatar_url 字段存储头像 URL。使用 sharp 库进行图片裁剪和压缩。

## Critical Files
- \`src/models/user.ts\` (10-50行) - 添加 avatar_url 字段
- \`src/services/upload.service.ts\` (1-80行) - 添加头像上传方法
- \`src/controllers/user.controller.ts\` (100-150行) - 添加头像上传端点
- \`src/middleware/validate-upload.ts\` - 新建：图片验证中间件

## Implementation Steps

### Step 1: Update User Model
- **Files**: src/models/user.ts
- **Complexity**: Low
- **Dependencies**: None
- Add \`avatar_url?: string\` field to User interface
- Update migration to add column to users table

### Step 2: Create Upload Validation Middleware
- **Files**: src/middleware/validate-upload.ts (new)
- **Complexity**: Medium
- **Dependencies**: None
- Validate file type (jpg, png, webp)
- Validate file size (max 5MB)
- Validate image dimensions (min 100x100, max 2000x2000)

### Step 3: Add Avatar Upload Method
- **Files**: src/services/upload.service.ts
- **Complexity**: Medium
- **Dependencies**: Step 1, Step 2
- Add \`uploadAvatar(file: Express.Multer.File)\` method
- Use sharp for image processing (resize to 400x400, quality 80%)
- Upload to S3 and return URL

### Step 4: Add Upload Endpoint
- **Files**: src/controllers/user.controller.ts
- **Complexity**: Medium
- **Dependencies**: Step 3
- Add POST /api/users/avatar endpoint
- Apply validation middleware
- Call upload service
- Update user model

### Step 5: Update Frontend
- **Files**: src/frontend/components/AvatarUpload.tsx (new)
- **Complexity**: Low
- **Dependencies**: Step 4
- Create avatar upload component
- Add preview functionality
- Handle errors

## Verification
- [ ] Upload jpg image (valid)
- [ ] Upload png image (valid)
- [ ] Upload webp image (valid)
- [ ] Upload invalid format (rejected)
- [ ] Upload oversized file (rejected)
- [ ] Upload undersized image (rejected)
- [ ] Verify image is resized to 400x400
- [ ] Verify image quality is 80%
- [ ] Verify URL is stored in user model
- [ ] Verify image is accessible from S3

## Risks & Mitigation
- **Risk**: Image processing may timeout for large files
  - **Mitigation**: Add timeout and size limit, use streaming
- **Risk**: S3 upload may fail
  - **Mitigation**: Add retry logic, handle errors gracefully
- **Risk**: Malicious image files
  - **Mitigation**: Use sharp for safe processing, validate file headers

## Notes
- Use existing S3 configuration
- No database migration needed (use ALTER TABLE in migration tool)
- Frontend component should show loading state
`)

// Phase 5: Exit Planning (请求批准)
interview({
  questions: [
    {
      id: "approval",
      type: "single",
      question: "Do you approve this plan?",
      options: ["Approve", "Reject", "Request Changes"]
    }
  ]
})
```

## 3. Security Reviewer 代理

### 使用场景

```javascript
// 审查最近的变更
subagent({
  agent: "security-reviewer",
  task: `
    Review the following code changes for security vulnerabilities:

    Git Diff:
    \`\`\`
    diff --git a/src/controllers/auth.controller.ts b/src/controllers/auth.controller.ts
    index 1234567..abcdefg 100644
    --- a/src/controllers/auth.controller.ts
    +++ b/src/controllers/auth.controller.ts
    @@ -10,7 +10,12 @@ export class AuthController {
         const user = await this.authService.login(email, password);
         return { token: user.token };
       }
    +
    +  async resetPassword(email: string, newPassword: string) {
    +    const user = await this.userService.findByEmail(email);
    +    user.password = newPassword;  // No hashing!
    +    await this.userService.save(user);
    +  }
     }
    \`\`\`

    Focus on:
    1. Input validation vulnerabilities
    2. Authentication & authorization issues
    3. Crypto & secrets management
    4. Injection & code execution
    5. Data exposure

    Only report HIGH and MEDIUM confidence issues (>80%).
  `
})
```

### 预期输出

```markdown
# Vuln 1: CRYPTO: `src/controllers/auth.controller.ts:15`

* **Severity**: High
* **Description**: Password is stored directly without hashing, allowing plaintext password storage and potential credential theft if database is compromised
* **Exploit Scenario**: Attacker gains database access through SQL injection or other vulnerability, retrieves all user passwords in plaintext, can immediately use them to access user accounts
* **Recommendation**: Use bcrypt or argon2 to hash passwords before storage. Example: `user.password = await bcrypt.hash(newPassword, 10);`

## Summary
Found 1 HIGH severity vulnerability: unhashed password storage in resetPassword function. This is a critical security issue that must be fixed before deployment.
```

## 4. 组合使用示例

### 完整工作流：添加新功能

```javascript
// 1. 使用 Planner 进行五阶段规划
subagent({
  agent: "planner",
  task: "实现用户评论功能，支持 CRUD、回复嵌套、点赞"
})

// 2. Planner 会自动调用 Scout 进行并行探索
// 3. Planner 会设计方案并请求批准
// 4. 用户批准后，开始实现

// 5. 实现过程中使用 Worker
subagent({
  agent: "worker",
  task: "实现评论模型和数据库迁移"
})

// 6. 实现完成后，使用 Security Reviewer 进行安全审查
subagent({
  agent: "security-reviewer",
  task: "审查评论功能的安全漏洞"
})

// 7. 使用 Reviewer 进行代码质量审查
subagent({
  agent: "reviewer",
  task: "审查评论功能的代码质量"
})
```

## 5. 并行探索示例

### 多区域代码库探索

```javascript
// 同时探索多个不相关的区域
subagent({
  tasks: [
    { agent: "scout", task: "查找所有 API 路由定义" },
    { agent: "scout", task: "查找数据库模型和 schema" },
    { agent: "scout", task: "查找测试文件和测试模式" }
  ]
})

// 输出会包含三个独立的探索结果
```

## 6. 链式执行示例

### 顺序依赖任务

```javascript
// 链式执行：每一步依赖前一步的输出
subagent({
  chain: [
    { agent: "scout", task: "查找所有 API 端点定义" },
    { agent: "analyst", task: "分析 API 设计模式：{previous}" },
    { agent: "worker", task: "生成 API 文档：{previous}" },
    { agent: "reviewer", task: "审查文档质量：{previous}" }
  ]
})

// {previous} 会被替换为上一步的输出
```

## 7. 命令行使用

### 使用斜杠命令

```bash
# 列出所有可用代理
/sub

# 调用 scout 代理
/sub:scout 查找认证相关代码

# 调用 planner 代理
/sub:planner 实现用户头像上传功能

# 调用 security-reviewer 代理
/sub:security-reviewer 审查最近的安全变更

# 创建新代理
/create-agent custom "自定义代理描述" --scope user --template worker

# 列出用户代理
/list-agents user

# 删除代理
/delete-agent custom --scope user
```

## 8. 代理模式说明

### Readonly 模式
- **代理**: scout, security-reviewer
- **限制**: 只能读取文件，不能修改
- **用途**: 代码探索、安全审查
- **工具**: read, grep, find, ls, bash (只读命令)

### Planning 模式
- **代理**: planner
- **限制**: 只能编辑计划文件，其他操作只读
- **用途**: 方案设计、任务规划
- **工具**: read, grep, find, ls, bash (只读), subagent, interview

### Standard 模式
- **代理**: worker, reviewer
- **限制**: 无限制
- **用途**: 代码实现、代码审查
- **工具**: 所有可用工具

## 9. 最佳实践

### 选择合适的代理
- **探索代码库**: 使用 `scout` (只读模式)
- **规划复杂任务**: 使用 `planner` (五阶段工作流)
- **实现功能**: 使用 `worker` (标准模式)
- **安全审查**: 使用 `security-reviewer` (只读模式)
- **代码审查**: 使用 `reviewer` (标准模式)

### 并行 vs 链式
- **独立任务**: 使用并行模式 (`tasks` 参数)
- **依赖任务**: 使用链式模式 (`chain` 参数 + `{previous}`)

### 上下文传递
- **需要完整上下文**: 使用 `requires_context: true` 的代理
- **不需要上下文**: 使用 `requires_context: false` 的代理

## 10. 故障排除

### Scout 代理报错
- 检查是否尝试修改文件（只读模式不允许）
- 检查 bash 命令是否为只读命令

### Planner 代理未生成计划
- 检查是否完成了所有五个阶段
- 检查是否调用了 interview 工具请求批准

### Security Reviewer 无输出
- 检查代码变更是否确实存在安全问题
- 检查是否触发了硬性排除规则（如 DOS 漏洞）
- 检查置信度是否 >80%