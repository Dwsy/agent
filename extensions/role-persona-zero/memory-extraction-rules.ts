type PreferenceCandidate = { category: string; text: string };

const FILE_OR_PATH_RE = /(?:^|[\s"'`(])(?:\.?\/?[\w-]+[\/\\])*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|yaml|yml|toml|sql|java|kt|scala|py|rb|go|rs|sh|fish|zsh|bash|vue|svelte|astro|css|scss|less|html|xml|ini|cfg|conf|env|lock)(?:$|[\s"'`),.:;])/i;
const ENV_OR_CONST_RE = /\b[A-Z][A-Z0-9_]{2,}\b/;
const GIT_ARTIFACT_RE = /\b(?:git|pr\s*#?\d+|pull request|issue\s*#?\d+|merge request|mr\s*#?\d+|branch|tag|commit\s+[0-9a-f]{7,})\b/i;
const DERIVABLE_CUE_RE = /(?:文件|路径|目录|配置|日志|报错|错误日志|测试失败|函数|类|接口|字段|端口|路由|插件|模型|依赖|导入|schema|迁移|tsconfig|package\.json|docker-compose|\.gitignore|\.env|README|CHANGELOG|API|WebSocket|SQLite|MyBatis|TypeScript|Playwright|Volar|token|errcode|context_token|to_user_id|session_path|kilo\.ts|savepoint|stemming|NOT 支持)/i;

// 一次性任务观察 — 会话级事件，应进 daily memory，不进 consolidated
const EPHEMERAL_TASK_RE = /(?:已完成|已修复|已实现|已添加|已删除|已移除|已验证|已增强|已迁移|已更新|已确认|已解决|已关闭|已合并|已提交|已推送|测试通过|测试成功|回滚成功|部署成功|上线成功|清空.*?验证|调整为|本次问题|根本原因|功能测试成功|构建验证通过|回滚功能)/i;

// 具体表/字段/值细节 — 可从代码或数据库推导，不是跨会话知识
const SPECIFIC_DETAIL_RE = /(?:存储格式为 decimal|字段类型为|decimal\([^)]+\)|表.*?包含.*?字段|存储在.*?表中|字段名为|映射成.*?报|状态\s*\d+\s*(?:对应|展示))/i;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function getDerivableMemoryReason(text: string): string | null {
  const normalized = normalize(text);
  if (!normalized) return "empty";
  if (FILE_OR_PATH_RE.test(normalized)) return "file_or_path_reference";
  if (ENV_OR_CONST_RE.test(normalized)) return "env_or_constant_reference";
  if (GIT_ARTIFACT_RE.test(normalized)) return "git_artifact_reference";
  if (DERIVABLE_CUE_RE.test(normalized)) return "repo_state_reference";
  return null;
}

export function isDerivableMemoryCandidate(text: string): boolean {
  return getDerivableMemoryReason(text) !== null;
}

/**
 * Check if text is an ephemeral task observation (session-level event, not cross-session learning).
 * These should go to daily memory, not consolidated.
 */
export function isEphemeralTaskObservation(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  if (EPHEMERAL_TASK_RE.test(normalized)) return true;
  if (SPECIFIC_DETAIL_RE.test(normalized)) return true;
  return false;
}

export function filterAutoExtractedLearnings(items: string[]): string[] {
  return items.filter((text) => !isDerivableMemoryCandidate(text));
}

export function filterAutoExtractedPreferences(items: PreferenceCandidate[]): PreferenceCandidate[] {
  return items.filter((item) => !isDerivableMemoryCandidate(item.text));
}
