import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// === 配置与常量 ===
const GLOBAL_MEMORY_DIR = path.join(os.homedir(), ".pi-hippocampus");
const DB_PATH = path.join(GLOBAL_MEMORY_DIR, "hippocampus.db");
const CACHE_DIR = path.join(GLOBAL_MEMORY_DIR, ".cache");

const CONFIG = {
  embeddingModel: "Xenova/nomic-embed-text-v1",
  embeddingDimensions: 768,
  maxDistance: 1.2, // 向量相似度阈值 (sqlite-vec distance)
  maxMemories: 10,
  defaultDecayRate: 0.05, // 每天衰减 5%
};

// === 辅助函数 ===
function getProjectHash(cwd: string): string {
  return crypto.createHash("md5").update(cwd).digest("hex");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// === 延迟加载模块 ===
let Database: any = null;
let sqliteVec: any = null;
let pipeline: any = null;
let transformersEnv: any = null;
let embeddingPipeline: any = null;
let db: any = null;

async function loadDependencies() {
  if (Database && sqliteVec && pipeline) return;
  const betterSqlite = await import("better-sqlite3");
  Database = betterSqlite.default;
  sqliteVec = await import("sqlite-vec");
  const transformers = await import("@xenova/transformers");
  pipeline = transformers.pipeline;
  transformersEnv = transformers.env;
  transformersEnv.allowLocalModels = true;
  transformersEnv.allowRemoteModels = true;
  transformersEnv.cacheDir = CACHE_DIR;
}

// === 数据库初始化 (V4.2 Schema: Hippocampus) ===
async function initDB() {
  if (db) return db;
  await loadDependencies();
  ensureDir(GLOBAL_MEMORY_DIR);
  db = new Database(DB_PATH);
  sqliteVec.load(db);

  // 1. Memories Table (Expanded)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT,
      
      -- Context & Scope
      scope TEXT DEFAULT 'local',       -- 'global' | 'local'
      project_id TEXT,                  -- 项目路径Hash (仅 local 有效)
      
      -- V3.0 Fields
      status TEXT DEFAULT 'active',     -- 'active' | 'archived' | 'rejected'
      parent_id TEXT,                   -- 演化链
      change_reason TEXT,
      source TEXT DEFAULT 'user',
      
      -- V4.0 Brain-Like Fields
      type TEXT DEFAULT 'fact',         -- 'fact' (事实), 'event' (经历), 'rule' (规则/偏好)
      importance INTEGER DEFAULT 1,     -- 1-10, 情感/重要性权重
      decay_rate REAL DEFAULT 0.05,     -- 遗忘速率 (0.0 - 1.0)
      
      -- Access Stats
      access_count INTEGER DEFAULT 0,   -- 提取次数 (LTP: Long-term Potentiation)
      last_accessed_at INTEGER,         -- 最后激活时间
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 2. Associative Links (Synapses)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT DEFAULT 'association', -- 'association', 'causality', 'sequence'
      strength REAL DEFAULT 1.0,       -- 连接强度 0.0-1.0
      created_at INTEGER NOT NULL,
      PRIMARY KEY (source_id, target_id)
    );
  `);

  // 3. Vector Table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding FLOAT[${CONFIG.embeddingDimensions}]
    );
  `);

  // 4. Schema Migration (Auto-upgrade V3 -> V4)
  try {
    const tableInfo = db.pragma("table_info(memories)");
    const hasType = tableInfo.some((col: any) => col.name === "type");
    if (!hasType) {
      console.log("🧠 Migrating memory cortex to V4.0 (Hippocampus)...");
      const columns = [
        "ADD COLUMN type TEXT DEFAULT 'fact'",
        "ADD COLUMN importance INTEGER DEFAULT 1",
        "ADD COLUMN decay_rate REAL DEFAULT 0.05"
      ];
      for (const col of columns) {
        try { db.exec(`ALTER TABLE memories ${col};`); } catch (e) {}
      }
    }
  } catch (e) {
    console.error("Schema migration failed:", e);
  }

  return db;
}

function closeDB() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (e) {}
    db = null;
  }
}

async function getEmbedding(text: string): Promise<Float32Array> {
  await loadDependencies();
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline("feature-extraction", CONFIG.embeddingModel);
  }
  const output = await embeddingPipeline(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data);
}

// === 核心逻辑：仿生记忆存储 ===
interface MemoryOptions {
  tags?: string[];
  scope?: "global" | "local";
  projectId?: string;
  parentId?: string;
  changeReason?: string;
  source?: string;
  type?: "fact" | "event" | "rule";
  importance?: number;
}

async function saveMemory(content: string, options: MemoryOptions = {}): Promise<string> {
  const database = await initDB();
  const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();
  
  const scope = options.scope || "local";
  const projectId = scope === "local" ? (options.projectId || "unknown") : null;
  const tagsStr = options.tags?.length ? options.tags.map(t => t.toLowerCase()).join(",") : null;
  
  // 智能默认值
  const type = options.type || "fact";
  let importance = options.importance || 1;
  let decayRate = CONFIG.defaultDecayRate;

  // 规则类记忆更难遗忘
  if (type === 'rule') {
    importance = Math.max(importance, 5); 
    decayRate = 0.01; // 几乎不遗忘
  }
  // 高重要性记忆不遗忘
  if (importance >= 8) {
    decayRate = 0.0;
  }

  // 演化逻辑
  if (options.parentId) {
    database.prepare(`
      UPDATE memories 
      SET status = 'archived', updated_at = ?, change_reason = ?
      WHERE id = ?
    `).run(now, options.changeReason || "Evolved", options.parentId);
    
    // 继承链接 (Synaptic inheritance)
    database.prepare(`
      INSERT OR IGNORE INTO memory_links (source_id, target_id, type, strength, created_at)
      SELECT ?, target_id, type, strength, ? FROM memory_links WHERE source_id = ?
    `).run(id, now, options.parentId);
  }

  // 插入主表
  const embedding = await getEmbedding(content);
  const embeddingBuffer = Buffer.from(embedding.buffer);

  database.prepare(`
    INSERT INTO memories (
      id, content, tags, scope, project_id, status, parent_id, source, 
      type, importance, decay_rate,
      created_at, updated_at, last_accessed_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, content, tagsStr, scope, projectId, options.parentId || null, options.source || "user_explicit",
    type, importance, decayRate,
    now, now, now
  );

  database.prepare(`
    INSERT INTO vec_memories (memory_id, embedding) VALUES (?, ?)
  `).run(id, embeddingBuffer);

  // 自动联想 (Spreading Activation - Simple Version)
  // 如果不是更新旧记忆，尝试找到一个最相似的现有记忆建立弱连接
  if (!options.parentId) {
    try {
        const similar = await searchMemories(content, projectId || "", 1);
        if (similar.length > 0 && similar[0].similarity > 0.85) {
            database.prepare(`
                INSERT INTO memory_links (source_id, target_id, type, strength, created_at)
                VALUES (?, ?, 'auto_association', ?, ?)
            `).run(id, similar[0].id, 0.5, now);
        }
    } catch(e) {}
  }

  return id;
}

// === 核心逻辑：混合评分检索 (The Recall Algorithm) ===
async function searchMemories(query: string, projectId: string, limit: number = CONFIG.maxMemories) {
  const database = await initDB();
  const queryEmbedding = await getEmbedding(query);
  const queryBuffer = Buffer.from(queryEmbedding.buffer);
  const now = Date.now();

  // 1. Vector Search (Semantic Retrieval)
  const vecResults = database.prepare(`
    SELECT memory_id, distance
    FROM vec_memories
    WHERE embedding MATCH ? AND k = ?
    ORDER BY distance
  `).all(queryBuffer, limit * 4); // Fetch more candidates for re-ranking

  if (vecResults.length === 0) return [];

  const ids = vecResults.map((r: any) => r.memory_id);
  const placeholders = ids.map(() => "?").join(",");

  // 2. Fetch Metadata & Apply Filters (Relaxed for Smart Connectivity)
  const rows = database.prepare(`
    SELECT * FROM memories 
    WHERE id IN (${placeholders})
    AND status = 'active'
    -- We removed the hard project_id filter to allow cross-project association
  `).all(...ids);

  // 3. Brain-Like Re-ranking (with Context Penalty)
  // Score = Similarity * (1 + log(Access)) * Importance * TimeDecay * ContextMatch
  const results = rows.map((row: any) => {
    const vec = vecResults.find((v: any) => v.memory_id === row.id);
    const distance = vec ? vec.distance : 1.0;
    const similarity = Math.max(0, 1 - (distance * distance / 2)); // Cosine approx
    
    // Time Decay (Ebbinghaus Forgetting Curve approx)
    const daysElapsed = (now - (row.last_accessed_at || row.created_at)) / (1000 * 60 * 60 * 24);
    const retention = 1 / (1 + (row.decay_rate || 0.05) * daysElapsed);
    
    // Importance Boost
    const importanceBoost = 1 + (row.importance || 1) * 0.1; 
    
    // LTP
    const accessBoost = 1 + Math.log1p(row.access_count || 0) * 0.1;

    // Context / Scope Penalty (The "Permeability" Logic)
    let contextFactor = 1.0;
    const isLocalContext = (row.scope === 'local' && row.project_id === projectId);
    const isGlobal = (row.scope === 'global');
    
    if (!isGlobal && !isLocalContext) {
        // Alien memory (from another project)
        if (similarity > 0.80 && (row.importance || 0) >= 5) {
             // "Breakthrough" memory: Relevant & Important -> Mild penalty
             contextFactor = 0.7;
        } else if (similarity > 0.65) {
             // Moderately relevant alien memory -> Medium penalty
             contextFactor = 0.4;
        } else {
             // Irrelevant alien memory -> Heavy penalty
             contextFactor = 0.2; 
        }
    }

    const finalScore = similarity * retention * importanceBoost * accessBoost * contextFactor;

    return {
      ...row,
      distance,
      similarity,
      retention,
      finalScore,
      isAlien: (!isGlobal && !isLocalContext) // Flag for UI
    };
  })
  .filter((r: any) => r.finalScore > 0.15) // V4.2: Lowered threshold for better recall
  .sort((a: any, b: any) => b.finalScore - a.finalScore)
  .slice(0, limit);

  // 4. Update Access Stats (Reinforcement)
  const hitIds = results.map((r: any) => r.id);
  if (hitIds.length > 0) {
    const updatePlaceholders = hitIds.map(() => "?").join(",");
    database.prepare(`
      UPDATE memories 
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id IN (${updatePlaceholders})
    `).run(now, ...hitIds);
  }

  // 5. Associative Retrieval (Optional: Fetch linked memories)
  // For the top 2 results, fetch their strong links
  if (results.length > 0) {
    const topIds = results.slice(0, 2).map((r: any) => r.id);
    const linkPlaceholders = topIds.map(() => "?").join(",");
    
    const links = database.prepare(`
      SELECT target_id, strength FROM memory_links 
      WHERE source_id IN (${linkPlaceholders}) AND strength > 0.6
    `).all(...topIds);
    
    if (links.length > 0) {
       // Ideally we would fetch these linked memories too, but for now we just log them or add to context if we had more logic.
       // For V4.0 simplicity, we leave this as a foundation for "Graph RAG" later.
    }
  }

  return results;
}

// === 核心逻辑：整理与归纳 (Consolidation) ===
async function consolidateMemories(projectId: string) {
  const database = await initDB();
  // Find recent 'event' or 'fact' memories with low importance
  const rows = database.prepare(`
    SELECT id, content, created_at FROM memories
    WHERE project_id = ? AND scope = 'local' AND status = 'active'
    AND type IN ('event', 'fact') AND importance < 5
    ORDER BY created_at DESC LIMIT 20
  `).all(projectId);
  
  return rows;
}

// === 插件导出 ===
export default function (pi: any) {
  
  // Tool 1: Save Memory (V4 Hippocampus)
  pi.registerTool({
    name: "save_memory",
    description: "存入长期记忆。像人脑一样，支持区分事实/规则/经历，并标记重要性。",
    parameters: Type.Object({
      content: Type.String({ description: "记忆内容" }),
      type: Type.Optional(Type.String({ description: "'fact'(事实), 'rule'(规则/偏好), 'event'(经历/事件)。默认为 fact" })),
      importance: Type.Optional(Type.Number({ description: "重要性 1-10。1=琐事, 10=核心原则。默认为 1" })),
      tags: Type.Array(Type.String(), { default: [] }),
      scope: Type.Optional(Type.String({ description: "'global' 或 'local'" })),
      previous_memory_id: Type.Optional(Type.String({ description: "如果是修正旧记忆，传入旧ID" })),
      change_reason: Type.Optional(Type.String())
    }),
    async execute(id: string, params: any, signal: any, onUpdate: any, ctx: any) {
      try {
        const projectId = getProjectHash(ctx.cwd);
        const memId = await saveMemory(params.content, {
          tags: params.tags,
          scope: params.scope || "local",
          projectId: projectId,
          parentId: params.previous_memory_id,
          changeReason: params.change_reason,
          type: params.type as any,
          importance: params.importance
        });
        
        return { 
            content: [{ type: "text", text: `✓ Memory solidified (ID: ${memId})\nType: ${params.type||'fact'} | Importance: ${params.importance||1}` }], 
            details: { id: memId } 
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  });

  // Tool 2: Search Memory (Associative)
  pi.registerTool({
    name: "search_memory",
    description: "回忆。基于语义相似度、时间衰减、重要性和访问频率进行混合检索。",
    parameters: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number())
    }),
    async execute(id: string, params: any, signal: any, onUpdate: any, ctx: any) {
      const projectId = getProjectHash(ctx.cwd);
      const results = await searchMemories(params.query, projectId, params.limit || 10);
      
      if (results.length === 0) return { content: [{ type: "text", text: "No relevant memories found." }] };

      // 返回所有记忆内容给 AI 使用
      const allMemories = results.map((r: any) => {
        let icon = r.scope === 'global' ? '🌍' : '🏠';
        if (r.isAlien) icon = '🛸';
        const typeIcon = r.type === 'rule' ? '📜' : (r.type === 'event' ? '📅' : '💡');
        const score = Math.round(r.finalScore * 100);
        return `[${r.id}] ${icon}${typeIcon} (Act:${score}%) ${r.content}`;
      }).join("\n");

      // content 返回完整内容给 AI，details.summary 用于 TUI 显示
      const summary = `🧠 Recalled ${results.length} memories`;

      return { 
        content: [{ type: "text", text: `${summary}\n${allMemories}` }], 
        details: { results, summary, count: results.length } 
      };
    },
    // 自定义渲染：TUI 只显示数量摘要
    renderResult(result: any, options: any, theme: any) {
      const count = result.details?.count || 0;
      const summary = result.details?.summary || `🧠 Recalled ${count} memories`;
      return new Text(theme.fg("accent", summary), 0, 0);
    }
  });

  // Tool 3: Connect Memories (Synapse Builder)
  pi.registerTool({
    name: "connect_memories",
    description: "手动建立两条记忆之间的关联（突触连接）。",
    parameters: Type.Object({
      source_id: Type.String(),
      target_id: Type.String(),
      relationship: Type.String({ description: "关联描述，如 'causes', 'contradicts', 'relates_to'" }),
      strength: Type.Optional(Type.Number({ description: "0.1 - 1.0" }))
    }),
    async execute(id: string, params: any, signal: any, onUpdate: any, ctx: any) {
      const db = await initDB();
      db.prepare(`
        INSERT OR REPLACE INTO memory_links (source_id, target_id, type, strength, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(params.source_id, params.target_id, params.relationship, params.strength || 1.0, Date.now());
      return { content: [{ type: "text", text: `✓ Synapse established: ${params.source_id} <--> ${params.target_id}` }] };
    }
  });

  // Tool 4: Consolidate (Dreaming)
  pi.registerTool({
    name: "consolidate_memories",
    description: "整理碎片记忆。列出最近的琐碎记忆，供 AI 总结并转化为规则。",
    parameters: Type.Object({}),
    async execute(id: string, params: any, signal: any, onUpdate: any, ctx: any) {
      const projectId = getProjectHash(ctx.cwd);
      const items = await consolidateMemories(projectId);
      if (items.length === 0) return { content: [{ type: "text", text: "Memory is clean. No fragments to consolidate." }] };
      
      const list = items.map((i: any) => `- [${i.id}] ${i.content}`).join("\n");
      return { 
          content: [{ type: "text", text: `Found ${items.length} memory fragments. Please analyze and consolidate into Global/Local Rules, then archive the fragments:\n${list}` }] 
      };
    }
  });

  // 自动注入逻辑 (Updated for V4)
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const projectId = getProjectHash(ctx.cwd);
    const prompt = event.prompt;
    
    // 1. Auto-Recall
    let contextSection = "";
    if (prompt && prompt.length >= 4) {
      try {
        const results = await searchMemories(prompt, projectId, 5);
        if (results.length > 0) {
          ctx.ui.setStatus("memory", `🧠 回忆 (${results.length})`);
          contextSection = "\n\n### 🧠 CORTEX RECALL (Auto-retrieved):\n" +
            results.map((m: any) => {
                const typeMark = m.type === 'rule' ? 'RULE' : 'INFO';
                const impMark = m.importance > 5 ? '★' : '';
                return `- [${typeMark}${impMark}] ${m.content} (ID:${m.id})`;
            }).join("\n") +
            "\n(These are your activated memories. Use them.)";
        }
      } catch (e) {}
    }

    // 2. Subconscious Protocol V4 (Bio-mimetic)
    const subconscious = `
### 🧠 MEMORY PROTOCOL V4.0 (Bio-mimetic)
You are the owner of a "Hippocampus" memory system.
Current Project: ${projectId}

**YOUR DUTY:**
1. **Encode Reality**: precise \`save_memory\` calls.
   - **Facts**: "Project uses React v18" -> type:'fact', importance:3
   - **Events**: "User deployed to prod" -> type:'event', importance:5
   - **Rules**: "Always use type-safe SQL" -> type:'rule', importance:10 (CRITICAL!)
2. **Reinforce**: If you use a retrieved memory, it gets stronger (LTP).
3. **Evolve**: If a rule changes, use \`previous_memory_id\` to archive the old synapse.
4. **Connect**: If two memories are related, use \`connect_memories\`.

**ACTIVE SUMMARIZATION:**
Don't wait for user orders. If a conversation segment reveals new insights, preferences, or project states, **IMMEDIATELY** save them to memory. 
- Example: User says "I prefer short functions." -> SAVE IT! (type:'rule', scope:'global')
- Example: User explains a bug fix. -> SAVE IT! (type:'event', scope:'local')

**Silence**: Execute memory operations silently. Confirm with "✓".
`;

    return {
      systemPrompt: (event.systemPrompt || "") + subconscious + contextSection
    };
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    ctx.ui.notify("🧠 Hippocampus Memory Engine Online (Neuro-Ranking™ Active)", "info");
  });

  pi.on("session_shutdown", async () => closeDB());
}