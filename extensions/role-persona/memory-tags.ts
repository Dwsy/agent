/**
 * Memory Tags System - LLM-based Auto-Tagging + Forgetting Curve
 * 
 * Features:
 * - LLM-powered tag extraction from memory content
 * - Configurable tag extraction model
 * - Tag weight with forgetting curve (Ebbinghaus)
 * - Tag association network
 * - Self-learning tag vocabulary
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { completeSimple } from "@mariozechner/pi-ai";
import { log } from "./logger.ts";
import { config } from "./config.ts";

// ============ 配置 ============

const TAG_MODEL = config.autoMemory.tagModel || config.autoMemory.model;
const TAG_MIN_CONFIDENCE = 0.7;
const TAG_MAX_PER_MEMORY = 8;

// ============ 类型定义 ============

export interface TagInfo {
  count: number;           // 出现次数
  strength: number;        // 当前强度 0-100
  confidence: number;      // LLM 置信度 0-1
  firstSeen: string;       // YYYY-MM-DD
  lastUsed: string;        // YYYY-MM-DD
  lastExtracted: string;   // 上次提取时间
  sources: string[];       // 来源记忆ID
  associated: string[];    // 关联标签
  context: string[];       // 上下文片段（用于学习）
}

export interface TagAssociations {
  [tag: string]: { [relatedTag: string]: number }; // 共现次数
}

export interface TagsIndex {
  version: string;
  lastUpdated: string;
  extractionModel?: string;  // 使用的提取模型
  learnedVocabulary: string[]; // 自学习词汇表
  tags: { [tag: string]: TagInfo };
  associations: TagAssociations;
}

export interface TagExtractionResult {
  tags: Array<{
    tag: string;
    confidence: number;
    context: string;  // 为什么是这个标签
  }>;
  suggestedCategory?: string; // 建议的分类
}

// ============ LLM 标签提取 ============

const TAG_EXTRACTION_PROMPT = `You are a tag extraction specialist for a memory system.

Task: Analyze the memory content and extract relevant tags.

Rules:
1. Extract 3-8 specific, meaningful tags
2. Tags should be lowercase, no spaces (use hyphens)
3. Prefer technical terms: frameworks, languages, concepts, tools
4. Include domain-specific terms mentioned in content
5. Confidence 0.0-1.0 based on relevance certainty

Return JSON only:
{
  "tags": [
    {"tag": "vue", "confidence": 0.95, "context": "frontend framework mentioned"},
    {"tag": "reactivity", "confidence": 0.88, "context": "core concept discussed"}
  ],
  "suggestedCategory": "Code|Tools|Workflow|Communication|General"
}`;

async function resolveTagModel(
  ctx: ExtensionContext,
  requested?: string
): Promise<{ provider: string; modelId: string; apiKey: string } | null> {
  const needle = (requested || TAG_MODEL || "").trim().toLowerCase();
  
  if (!needle && ctx.model) {
    const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
    if (apiKey) {
      return {
        provider: ctx.model.provider,
        modelId: ctx.model.id,
        apiKey,
      };
    }
  }
  
  if (!needle) return null;
  
  const all = ctx.modelRegistry.getAll();
  const picked = all.find((m) => {
    const full = `${m.provider}/${m.id}`.toLowerCase();
    return full === needle || m.id.toLowerCase() === needle;
  });
  
  if (!picked) return null;
  const apiKey = await ctx.modelRegistry.getApiKey(picked);
  if (!apiKey) return null;
  
  return {
    provider: picked.provider,
    modelId: picked.id,
    apiKey,
  };
}

/**
 * 使用 LLM 从内容提取标签
 */
export async function extractTagsWithLLM(
  content: string,
  ctx: ExtensionContext,
  modelOverride?: string
): Promise<TagExtractionResult> {
  const modelInfo = await resolveTagModel(ctx, modelOverride);
  
  if (!modelInfo) {
    log("memory-tags", "No tag model available, using fallback");
    return extractTagsFallback(content);
  }
  
  const prompt = `${TAG_EXTRACTION_PROMPT}\n\nMemory content:\n"""\n${content.slice(0, 500)}\n"""\n\nExtract tags as JSON:`;
  
  try {
    const response = await completeSimple(
      {
        provider: modelInfo.provider,
        modelId: modelInfo.modelId,
        apiKey: modelInfo.apiKey,
        dangerouslyAllowBrowser: true,
      },
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 300 }
    );
    
    const result = parseTagResponse(response);
    log("memory-tags", `LLM extracted ${result.tags.length} tags using ${modelInfo.provider}/${modelInfo.modelId}`);
    
    return result;
  } catch (err) {
    log("memory-tags", `LLM tag extraction failed: ${err}`);
    return extractTagsFallback(content);
  }
}

function parseTagResponse(text: string): TagExtractionResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { tags: [] };
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      tags: (parsed.tags || [])
        .filter((t: any) => t.confidence >= TAG_MIN_CONFIDENCE)
        .slice(0, TAG_MAX_PER_MEMORY),
      suggestedCategory: parsed.suggestedCategory,
    };
  } catch {
    return { tags: [] };
  }
}

/**
 * Fallback: 规则提取（当 LLM 不可用时）
 */
function extractTagsFallback(content: string): TagExtractionResult {
  const tags: TagExtractionResult["tags"] = [];
  const normalized = content.toLowerCase();
  
  // 基础技术关键词（最小集，仅 fallback）
  const basicTerms = [
    "vue", "react", "postgres", "mysql", "database", "api", "error",
    "async", "promise", "cache", "test", "deploy", "git", "docker",
  ];
  
  for (const term of basicTerms) {
    if (normalized.includes(term)) {
      tags.push({
        tag: term,
        confidence: 0.6,
        context: "detected in content",
      });
    }
  }
  
  // 显式标签 #tag
  const explicit = content.match(/#(\w+)/g);
  if (explicit) {
    explicit.forEach(tag => {
      const clean = tag.slice(1).toLowerCase();
      if (!tags.find(t => t.tag === clean)) {
        tags.push({ tag: clean, confidence: 0.9, context: "explicit tag" });
      }
    });
  }
  
  return { tags: tags.slice(0, TAG_MAX_PER_MEMORY) };
}

// ============ 遗忘曲线算法 ============

/**
 * Ebbinghaus 遗忘曲线计算
 */
export function calculateRetention(
  originalStrength: number,
  daysPassed: number,
  reviewCount: number = 0,
  baseHalfLife: number = 30
): number {
  // 间隔重复增强记忆稳定性
  const stabilityMultiplier = Math.log(reviewCount + 2) / Math.log(2);
  const effectiveHalfLife = baseHalfLife * stabilityMultiplier;
  
  // 遗忘曲线: R = e^(-t/S)
  const decayRate = Math.log(2) / effectiveHalfLife;
  const retention = Math.exp(-decayRate * daysPassed);
  
  // 最小保留 10%
  return Math.max(0.1, retention);
}

export function calculateTagStrength(
  count: number,
  lastUsedDate: string,
  confidence: number = 0.8,
  reviewCount: number = 0
): number {
  const now = new Date();
  const lastUsed = new Date(lastUsedDate);
  const daysPassed = Math.max(0, (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
  
  // 基础权重
  const baseWeight = Math.min(20 + count * 5, 60);
  
  // 置信度加成
  const confidenceBonus = confidence * 20;
  
  // 遗忘衰减
  const retention = calculateRetention(1, daysPassed, reviewCount);
  
  // 最终强度
  const strength = (baseWeight + confidenceBonus) * retention;
  
  return Math.min(100, Math.round(strength));
}

// ============ 标签索引管理 ============

function getTagsIndexPath(rolePath: string): string {
  return join(rolePath, ".log", "memory-tags.json");
}

export function loadTagsIndex(rolePath: string): TagsIndex {
  const path = getTagsIndexPath(rolePath);
  
  if (!existsSync(path)) {
    return {
      version: "1.1",
      lastUpdated: new Date().toISOString(),
      extractionModel: TAG_MODEL || undefined,
      learnedVocabulary: [],
      tags: {},
      associations: {},
    };
  }
  
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    return {
      learnedVocabulary: [],
      ...parsed,
    };
  } catch {
    return {
      version: "1.1",
      lastUpdated: new Date().toISOString(),
      extractionModel: TAG_MODEL || undefined,
      learnedVocabulary: [],
      tags: {},
      associations: {},
    };
  }
}

export function saveTagsIndex(rolePath: string, index: TagsIndex): void {
  const path = getTagsIndexPath(rolePath);
  const dir = join(rolePath, ".log");
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  index.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(index, null, 2), "utf-8");
}

// ============ 标签更新（异步） ============

/**
 * 为记忆异步添加/更新标签（使用 LLM）
 */
export async function updateMemoryTagsAsync(
  rolePath: string,
  memoryId: string,
  content: string,
  ctx: ExtensionContext,
  existingTags?: string[]
): Promise<{ tags: string[]; newTags: string[]; suggestedCategory?: string }> {
  const index = loadTagsIndex(rolePath);
  const today = new Date().toISOString().split("T")[0];
  
  // 使用 LLM 提取标签
  const extraction = await extractTagsWithLLM(content, ctx);
  const llmTags = extraction.tags.map(t => t.tag);
  
  // 合并现有标签
  const allTags = [...new Set([...llmTags, ...(existingTags || [])])];
  const newTags: string[] = [];
  
  // 更新标签索引
  for (const tagData of extraction.tags) {
    const { tag, confidence, context } = tagData;
    
    if (!index.tags[tag]) {
      // 新标签
      index.tags[tag] = {
        count: 1,
        strength: calculateTagStrength(1, today, confidence),
        confidence,
        firstSeen: today,
        lastUsed: today,
        lastExtracted: today,
        sources: [memoryId],
        associated: [],
        context: [context],
      };
      newTags.push(tag);
      
      // 添加到学习词汇表
      if (!index.learnedVocabulary.includes(tag)) {
        index.learnedVocabulary.push(tag);
      }
    } else {
      // 现有标签更新
      const info = index.tags[tag];
      info.count++;
      info.lastUsed = today;
      info.lastExtracted = today;
      info.confidence = Math.max(info.confidence, confidence);
      info.strength = calculateTagStrength(info.count, info.firstSeen, info.confidence);
      
      if (!info.sources.includes(memoryId)) {
        info.sources.push(memoryId);
      }
      if (!info.context.includes(context)) {
        info.context.push(context);
      }
    }
  }
  
  // 更新关联网络
  for (let i = 0; i < allTags.length; i++) {
    for (let j = i + 1; j < allTags.length; j++) {
      const tag1 = allTags[i];
      const tag2 = allTags[j];
      
      if (!index.associations[tag1]) index.associations[tag1] = {};
      if (!index.associations[tag2]) index.associations[tag2] = {};
      
      index.associations[tag1][tag2] = (index.associations[tag1][tag2] || 0) + 1;
      index.associations[tag2][tag1] = (index.associations[tag2][tag1] || 0) + 1;
      
      // 更新关联列表
      if (index.tags[tag1] && !index.tags[tag1].associated.includes(tag2)) {
        index.tags[tag1].associated.push(tag2);
      }
      if (index.tags[tag2] && !index.tags[tag2].associated.includes(tag1)) {
        index.tags[tag2].associated.push(tag1);
      }
    }
  }
  
  saveTagsIndex(rolePath, index);
  log("memory-tags", `Updated tags for ${memoryId}: ${allTags.join(", ")} (model: ${index.extractionModel || "fallback"})`);
  
  return { 
    tags: allTags, 
    newTags,
    suggestedCategory: extraction.suggestedCategory,
  };
}

// ============ 查询功能 ============

export function getTagCloud(
  rolePath: string,
  limit: number = 50
): Array<{ tag: string; count: number; strength: number; confidence: number }> {
  const index = loadTagsIndex(rolePath);
  
  return Object.entries(index.tags)
    .map(([tag, info]) => ({
      tag,
      count: info.count,
      strength: calculateTagStrength(info.count, info.lastUsed, info.confidence),
      confidence: info.confidence,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

export function searchTags(
  rolePath: string,
  query: string
): Array<{ tag: string; info: TagInfo; strength: number }> {
  const index = loadTagsIndex(rolePath);
  const lowerQuery = query.toLowerCase();
  
  return Object.entries(index.tags)
    .filter(([tag]) => tag.includes(lowerQuery))
    .map(([tag, info]) => ({
      tag,
      info,
      strength: calculateTagStrength(info.count, info.lastUsed, info.confidence),
    }))
    .sort((a, b) => b.strength - a.strength);
}

export function getFadingTags(
  rolePath: string,
  threshold: number = 30
): Array<{ tag: string; info: TagInfo; strength: number; daysSinceUse: number }> {
  const index = loadTagsIndex(rolePath);
  const today = new Date();
  
  return Object.entries(index.tags)
    .map(([tag, info]) => {
      const strength = calculateTagStrength(info.count, info.lastUsed, info.confidence);
      const lastUsed = new Date(info.lastUsed);
      const daysSinceUse = Math.floor((today.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
      
      return { tag, info, strength, daysSinceUse };
    })
    .filter(t => t.strength < threshold && t.info.count > 1)
    .sort((a, b) => a.strength - b.strength);
}

export function getRelatedTags(
  rolePath: string,
  tag: string,
  limit: number = 5
): Array<{ tag: string; coOccurrence: number }> {
  const index = loadTagsIndex(rolePath);
  
  if (!index.associations[tag]) {
    return [];
  }
  
  return Object.entries(index.associations[tag])
    .map(([relatedTag, count]) => ({ tag: relatedTag, coOccurrence: count }))
    .sort((a, b) => b.coOccurrence - a.coOccurrence)
    .slice(0, limit);
}

// ============ 可视化 ============

export function generateTagCloudMarkdown(rolePath: string): string {
  const cloud = getTagCloud(rolePath, 100);
  
  if (cloud.length === 0) {
    return "## 🏷️ Tag Cloud\n\nNo tags yet. Memories will be automatically tagged.";
  }
  
  let md = "## 🏷️ Tag Cloud\n\n";
  
  const high = cloud.filter(t => t.strength >= 70);
  const medium = cloud.filter(t => t.strength >= 30 && t.strength < 70);
  const low = cloud.filter(t => t.strength < 30);
  
  if (high.length > 0) {
    md += "### 🔥 Active (>=70%)\n";
    md += high.map(t => "**" + t.tag + "** (" + t.count + ")").join(" • ") + "\n\n";
  }

  if (medium.length > 0) {
    md += "### 💡 Recent (30-70%)\n";
    md += medium.map(t => t.tag + " (" + t.count + ")").join(" • ") + "\n\n";
  }

  if (low.length > 0) {
    md += "### 💤 Fading (<30%)\n";
    md += low.map(t => "~" + t.tag + "~").join(" • ") + "\n\n";
  }
  
  return md;
}

export function generateTagReviewMarkdown(rolePath: string): string {
  const fading = getFadingTags(rolePath, 30);
  const cloud = getTagCloud(rolePath, 20);
  const index = loadTagsIndex(rolePath);
  
  let md = "## 📊 Tag Review\n\n";
  
  // 统计
  const active = cloud.filter(t => t.strength >= 70).length;
  md += "**Total Tags:** " + cloud.length + " | **Active:** " + active + " | **Fading:** " + fading.length + "\n\n";
  
  if (index.extractionModel) {
    md += "**Extraction Model:** " + index.extractionModel + "\n\n";
  }
  
  // 遗忘警告
  if (fading.length > 0) {
    md += "### ⚠️ Fading Tags\n\n";
    md += "Review related memories to reinforce:\n\n";
    
    fading.slice(0, 10).forEach(t => {
      const bar = "#".repeat(Math.ceil((100 - t.strength) / 10));
      md += "- **" + t.tag + "** " + bar + " " + t.strength + "% (" + t.daysSinceUse + "d ago)\n";
      
      const related = getRelatedTags(rolePath, t.tag, 3);
      if (related.length > 0) {
        md += "  -> related: " + related.map(r => r.tag).join(", ") + "\n";
      }
    });
    
    md += "\n";
  }
  
  // Top标签
  md += "### 🏆 Top Tags\n\n";
  cloud.slice(0, 10).forEach((t, i) => {
    const emoji = i < 3 ? "🥇" : i < 6 ? "🥈" : "🥉";
    const bar = "█".repeat(Math.ceil(t.strength / 10));
    md += emoji + " **" + t.tag + "** " + bar + " " + t.strength + "% (" + t.count + "x, conf: " + Math.round(t.confidence * 100) + "%)\n";
  });
  
  return md;
}

// ============ 维护 ============

export function recalculateAllTagStrengths(rolePath: string): void {
  const index = loadTagsIndex(rolePath);
  
  for (const [tag, info] of Object.entries(index.tags)) {
    info.strength = calculateTagStrength(info.count, info.lastUsed, info.confidence);
  }
  
  saveTagsIndex(rolePath, index);
  log("memory-tags", "Recalculated all tag strengths");
}

export function getLearnedVocabulary(rolePath: string): string[] {
  const index = loadTagsIndex(rolePath);
  return index.learnedVocabulary;
}

export function exportTagsForLLM(rolePath: string): string {
  const index = loadTagsIndex(rolePath);
  const cloud = getTagCloud(rolePath, 50);

  return [
    "# Learned Tags Vocabulary",
    "Extracted by: " + (index.extractionModel || "fallback"),
    "Total: " + cloud.length + " tags",
    "",
    "## Top Tags",
    ...cloud.slice(0, 20).map(t => "- " + t.tag + " (" + t.count + "x, " + t.strength + "%)"),
    "",
    "## Vocabulary",
    ...index.learnedVocabulary,
  ].join("\n");
}

export interface TagRegistryEntry {
  count: number;
  weight: number;
  lastUsed: number;
  forgotten: boolean;
  memories: Array<{ id: string; text: string; used: number; lastAccessed?: string }>;
}

export type TagRegistry = Record<string, TagRegistryEntry>;

export function getAllTags(data: any): TagRegistry {
  const registry: TagRegistry = {};

  // Process learnings
  for (const learning of data.learnings || []) {
    const tags = learning.tags || [];
    const weight = learning.weight ?? 1.0;
    const lastAccessed = learning.lastAccessed ? new Date(learning.lastAccessed).getTime() : Date.now();

    for (const tag of tags) {
      const lowerTag = tag.toLowerCase();
      if (!registry[lowerTag]) {
        registry[lowerTag] = {
          count: 0,
          weight: 0,
          lastUsed: lastAccessed,
          forgotten: false,
          memories: [],
        };
      }

      registry[lowerTag].count++;
      registry[lowerTag].weight += weight;
      registry[lowerTag].lastUsed = Math.max(registry[lowerTag].lastUsed, lastAccessed);
      registry[lowerTag].memories.push({
        id: learning.id,
        text: learning.text,
        used: learning.used,
        lastAccessed: learning.lastAccessed,
      });
    }
  }

  // Apply forgetting curve
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  for (const tag of Object.keys(registry)) {
    const entry = registry[tag];
    const daysSinceUse = (now - entry.lastUsed) / DAY;
    const retention = calculateRetention(daysSinceUse);
    entry.weight *= retention;
    entry.forgotten = retention < 0.3;
  }

  return registry;
}

export function buildTagCloudHTML(registry: TagRegistry, roleName: string): string {
  const sortedTags = Object.entries(registry).sort((a, b) => b[1].weight - a[1].weight);

  const tagsHtml = sortedTags.map(([tag, meta]) => {
    const cls = meta.weight > 5 ? "hot" : meta.weight > 2 ? "warm" : "cold";
    return "<div class=\"tag " + cls + "\">" + tag + "<span class=\"count\">" + meta.count + "</span><span class=\"weight\">" + meta.weight.toFixed(1) + "</span></div>";
  }).join("");

  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "<head><meta charset=\"UTF-8\"><title>Tags - " + roleName + "</title>",
    "<style>",
    "body{font-family:system-ui;background:#0d0d0d;color:#e5e5e5;padding:40px}",
    "h1{color:#f59e0b}",
    ".subtitle{color:#888;margin-bottom:30px}",
    ".tag-cloud{display:flex;flex-wrap:wrap;gap:8px}",
    ".tag{background:#111;border:1px solid #222;padding:6px 12px;border-radius:4px;font-size:13px}",
    ".tag.hot{border-color:#ef4444}",
    ".tag.warm{border-color:#f59e0b}",
    ".tag.cold{opacity:0.5}",
    ".count{background:#0d0d0d;padding:2px 6px;border-radius:3px;font-size:11px;color:#888}",
    ".weight{font-size:11px;color:#22c55e}",
    "</style></head><body>",
    "<h1>Tag Cloud</h1>",
    "<div class=\"subtitle\">" + roleName + " - " + sortedTags.length + " tags</div>",
    "<div class=\"tag-cloud\">" + tagsHtml + "</div>",
    "</body></html>"
  ].join("");

  return html;
}
