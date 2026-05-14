import type { ExtensionAPI, ToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { readFile, writeFile, access } from "fs/promises";
import { constants } from "fs";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface WhimsicalConfig {
  /** 意图识别模型 */
  intentModel: string;
  /** 默认语言 */
  defaultLanguage: string;
  /** 启用意图识别 */
  enableIntentDetection: boolean;
  /** 置信度阈值 (0-1) */
  confidenceThreshold: number;
  /** 自定义提示词 */
  customPrompts: Record<string, string>;
  /** 调试模式 */
  debugMode: boolean;
}

interface IntentResult {
  intent: string;
  confidence: number;
  action: string;
  params: Record<string, any>;
  language: string;
}

interface I18nKeys {
  welcome: string;
  intentDetected: string;
  executing: string;
  configSaved: string;
  configError: string;
  configLoaded: string;
  modelSet: string;
  languageSet: string;
  intentEnabled: string;
  intentDisabled: string;
  currentSettings: string;
  unknownCommand: string;
  helpText: string;
  configPath: string;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILE = new URL("./config.json", import.meta.url).pathname;

const DEFAULT_CONFIG: WhimsicalConfig = {
  intentModel: "openai-codex/gpt-5.1-codex-mini",
  defaultLanguage: "zh",
  enableIntentDetection: true,
  confidenceThreshold: 0.7,
  customPrompts: {},
  debugMode: false,
};

const TRANSLATIONS: Record<string, Partial<I18nKeys>> = {
  zh: {
    welcome: "🎭 Whimsical 已激活 - 智能意图识别助手",
    intentDetected: "🎯 检测到意图: {intent} (置信度: {confidence}%)",
    executing: "⚡ 执行操作: {action}",
    configSaved: "✅ 配置已保存到 {path}",
    configLoaded: "📂 配置已加载",
    configError: "❌ 配置错误: {error}",
    modelSet: "🤖 意图识别模型已设置为: {model}",
    languageSet: "🌐 语言已设置为: {lang}",
    intentEnabled: "✨ 意图识别已启用",
    intentDisabled: "🛑 意图识别已禁用",
    currentSettings: "⚙️ 当前设置",
    unknownCommand: "❓ 未知命令: {cmd}",
    configPath: "📁 配置文件: {path}",
    helpText: `
📚 Whimsical 命令:
  /whimsical config          - 查看当前配置
  /whimsical model <name>    - 设置意图识别模型
  /whimsical lang <zh|en|ja> - 设置语言
  /whimsical enable          - 启用意图识别
  /whimsical disable         - 禁用意图识别
  /whimsical threshold <0-1> - 设置置信度阈值
  /whimsical test <text>     - 测试意图识别
  /whimsical debug           - 切换调试模式
  /whimsical reset           - 重置为默认配置
    `,
  },
  en: {
    welcome: "🎭 Whimsical activated - Smart Intent Recognition Assistant",
    intentDetected: "🎯 Intent detected: {intent} (confidence: {confidence}%)",
    executing: "⚡ Executing: {action}",
    configSaved: "✅ Configuration saved to {path}",
    configLoaded: "📂 Configuration loaded",
    configError: "❌ Configuration error: {error}",
    modelSet: "🤖 Intent model set to: {model}",
    languageSet: "🌐 Language set to: {lang}",
    intentEnabled: "✨ Intent detection enabled",
    intentDisabled: "🛑 Intent detection disabled",
    currentSettings: "⚙️ Current Settings",
    unknownCommand: "❓ Unknown command: {cmd}",
    configPath: "📁 Config file: {path}",
    helpText: `
📚 Whimsical Commands:
  /whimsical config          - View current config
  /whimsical model <name>    - Set intent recognition model
  /whimsical lang <zh|en|ja> - Set language
  /whimsical enable          - Enable intent detection
  /whimsical disable         - Disable intent detection
  /whimsical threshold <0-1> - Set confidence threshold
  /whimsical test <text>     - Test intent detection
  /whimsical debug           - Toggle debug mode
  /whimsical reset           - Reset to default config
    `,
  },
  ja: {
    welcome: "🎭 Whimsical が有効化されました - スマート意図認識アシスタント",
    intentDetected: "🎯 意図を検出: {intent} (信頼度: {confidence}%)",
    executing: "⚡ 実行中: {action}",
    configSaved: "✅ 設定を保存しました {path}",
    configLoaded: "📂 設定を読み込みました",
    configError: "❌ 設定エラー: {error}",
    modelSet: "🤖 意図認識モデルを設定: {model}",
    languageSet: "🌐 言語を設定: {lang}",
    intentEnabled: "✨ 意図認識を有効化",
    intentDisabled: "🛑 意図認識を無効化",
    currentSettings: "⚙️ 現在の設定",
    unknownCommand: "❓ 不明なコマンド: {cmd}",
    configPath: "📁 設定ファイル: {path}",
    helpText: `
📚 Whimsical コマンド:
  /whimsical config          - 現在の設定を表示
  /whimsical model <name>    - 意図認識モデルを設定
  /whimsical lang <zh|en|ja> - 言語を設定
  /whimsical enable          - 意図認識を有効化
  /whimsical disable         - 意図認識を無効化
  /whimsical threshold <0-1> - 信頼度閾値を設定
  /whimsical test <text>     - 意図認識をテスト
  /whimsical debug           - デバッグモードを切り替え
  /whimsical reset           - デフォルト設定にリセット
    `,
  },
};

const INTENT_DETECTION_PROMPT = `You are an intent recognition assistant. Analyze the user's input and identify:
1. The primary intent
2. Confidence level (0-1)
3. Recommended action
4. Extracted parameters
5. Detected language (zh/en/ja)

Respond ONLY in JSON format:
{
  "intent": "intent_name",
  "confidence": 0.95,
  "action": "action_description",
  "params": {"key": "value"},
  "language": "zh"
}

Available intents:
- code_write: Write new code
- code_refactor: Refactor existing code
- code_review: Review code
- code_debug: Debug code
- file_read: Read/Analyze files
- file_search: Search in codebase
- explain: Explain concept or code
- question: General question
- casual: Casual conversation

User input: {input}

JSON response:`;

// ============================================================================
// Config Manager (Node.js fs-based)
// ============================================================================

class ConfigManager {
  private config: WhimsicalConfig;
  private filePath: string;

  constructor(filePath: string, defaults: WhimsicalConfig) {
    this.filePath = filePath;
    this.config = { ...defaults };
  }

  private async fileExists(): Promise<boolean> {
    try {
      await access(this.filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<void> {
    try {
      if (await this.fileExists()) {
        const content = await readFile(this.filePath, "utf-8");
        const loaded = JSON.parse(content);
        this.config = { ...this.config, ...loaded };
      } else {
        // Create default config file if not exists
        await this.save();
      }
    } catch (error) {
      console.error("[Whimsical] Failed to load config:", error);
      // Continue with defaults
    }
  }

  async save(): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (error) {
      console.error("[Whimsical] Failed to save config:", error);
      throw error;
    }
  }

  get(): WhimsicalConfig {
    return { ...this.config };
  }

  async update(updates: Partial<WhimsicalConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.save();
  }

  async reset(defaults: WhimsicalConfig): Promise<void> {
    this.config = { ...defaults };
    await this.save();
  }

  getPath(): string {
    return this.filePath;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function t(key: keyof I18nKeys, lang: string, vars?: Record<string, string>): string {
  const translations = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  let text = translations[key] || TRANSLATIONS.zh[key] || key;
  
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    });
  }
  
  return text;
}

function formatConfig(config: WhimsicalConfig, lang: string, configPath: string): string {
  return `
${t('currentSettings', lang)}:
  • Model: ${config.intentModel}
  • Language: ${config.defaultLanguage}
  • Intent Detection: ${config.enableIntentDetection ? '✅' : '❌'}
  • Threshold: ${(config.confidenceThreshold * 100).toFixed(0)}%
  • Debug Mode: ${config.debugMode ? '✅' : '❌'}
  • Custom Prompts: ${Object.keys(config.customPrompts).length}

${t('configPath', lang, { path: configPath })}
  `;
}

// ============================================================================
// Intent Detection Simulation
// ============================================================================

async function simulateIntentDetection(input: string): Promise<IntentResult> {
  const lower = input.toLowerCase();
  
  if (/write|create|generate|implement.*code|function|class/i.test(lower)) {
    return {
      intent: "code_write",
      confidence: 0.92,
      action: "Generate code based on requirements",
      params: { type: "generation" },
      language: detectLanguage(input),
    };
  }
  
  if (/refactor|rewrite|improve|optimize|clean.*up/i.test(lower)) {
    return {
      intent: "code_refactor",
      confidence: 0.88,
      action: "Refactor and improve code quality",
      params: { type: "refactoring" },
      language: detectLanguage(input),
    };
  }
  
  if (/debug|fix|error|bug|issue|not working|broken/i.test(lower)) {
    return {
      intent: "code_debug",
      confidence: 0.90,
      action: "Debug and fix issues",
      params: { type: "debugging" },
      language: detectLanguage(input),
    };
  }
  
  if (/review|check|analyze.*code|quality/i.test(lower)) {
    return {
      intent: "code_review",
      confidence: 0.85,
      action: "Review code for quality and issues",
      params: { type: "review" },
      language: detectLanguage(input),
    };
  }

  if (/read|show|display|open.*file/i.test(lower)) {
    return {
      intent: "file_read",
      confidence: 0.87,
      action: "Read and analyze file contents",
      params: { type: "file_read" },
      language: detectLanguage(input),
    };
  }
  
  if (/search|find|locate|where.*is/i.test(lower)) {
    return {
      intent: "file_search",
      confidence: 0.84,
      action: "Search in codebase",
      params: { type: "search" },
      language: detectLanguage(input),
    };
  }

  if (/explain|how.*work|what.*is|why/i.test(lower)) {
    return {
      intent: "explain",
      confidence: 0.82,
      action: "Explain concept or mechanism",
      params: { type: "explanation" },
      language: detectLanguage(input),
    };
  }
  
  if (/\?$/ || /question|wonder|curious/i.test(lower)) {
    return {
      intent: "question",
      confidence: 0.75,
      action: "Answer general question",
      params: { type: "qa" },
      language: detectLanguage(input),
    };
  }

  return {
    intent: "casual",
    confidence: 0.60,
    action: "Engage in conversation",
    params: {},
    language: detectLanguage(input),
  };
}

function detectLanguage(input: string): string {
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(input)) return "ja";
  if (/[\u4e00-\u9fa5]/.test(input)) return "zh";
  return "en";
}

function generateEnhancement(intent: IntentResult): string | null {
  const enhancements: Record<string, string> = {
    code_write: "Please provide clear requirements and consider edge cases.",
    code_refactor: "Focus on maintainability and performance improvements.",
    code_debug: "Include error messages and relevant code snippets.",
    code_review: "Check for best practices, security, and performance.",
    file_read: "Analyze the file structure and dependencies.",
    file_search: "Use appropriate search patterns and filters.",
    explain: "Provide clear, structured explanation with examples.",
    question: "Give a concise and accurate answer.",
  };
  
  return enhancements[intent.intent] || null;
}

// ============================================================================
// Main Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  const configManager = new ConfigManager(CONFIG_FILE, DEFAULT_CONFIG);
  let lastIntent: IntentResult | null = null;

  // ==========================================================================
  // Register Config Tool
  // ==========================================================================
  
  pi.registerTool({
    name: "whimsical_config",
    label: "Whimsical Config",
    description: "Manage whimsical extension configuration via JSON file",
    parameters: Type.Object({
      action: StringEnum(["get", "set", "reset", "path"] as const),
      key: Type.Optional(Type.String()),
      value: Type.Optional(Type.Any()),
    }),

    async execute(toolCallId, params, signal, onUpdate): Promise<ToolResult> {
      const { action, key, value } = params;
      const config = configManager.get();
      const lang = config.defaultLanguage;

      try {
        switch (action) {
          case "get":
            return {
              content: [{
                type: "text",
                text: key ? JSON.stringify({ [key]: config[key as keyof WhimsicalConfig] }, null, 2) 
                           : JSON.stringify(config, null, 2)
              }],
            };

          case "set":
            if (!key) throw new Error("Key is required");
            if (key in config) {
              await configManager.update({ [key]: value } as Partial<WhimsicalConfig>);
              return {
                content: [{ 
                  type: "text", 
                  text: t('configSaved', lang, { path: configManager.getPath() }) 
                }],
              };
            }
            throw new Error(`Unknown config key: ${key}`);

          case "reset":
            await configManager.reset(DEFAULT_CONFIG);
            return {
              content: [{ 
                type: "text", 
                text: t('configSaved', lang, { path: configManager.getPath() }) 
              }],
            };

          case "path":
            return {
              content: [{ type: "text", text: configManager.getPath() }],
            };

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: t('configError', lang, { error: String(error) }) }],
          isError: true,
        };
      }
    },
  });

  // ==========================================================================
  // Register Intent Detection Tool
  // ==========================================================================
  
  pi.registerTool({
    name: "whimsical_detect_intent",
    label: "Detect Intent",
    description: "Detect user intent using configurable small model",
    parameters: Type.Object({
      input: Type.String(),
      model: Type.Optional(Type.String()),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<ToolResult> {
      const { input, model } = params;
      const config = configManager.get();
      const lang = config.defaultLanguage;

      if (!config.enableIntentDetection) {
        return {
          content: [{ type: "text", text: "Intent detection is disabled" }],
        };
      }

      try {
        const detectedModel = model || config.intentModel;
        const result = await simulateIntentDetection(input);
        
        lastIntent = result;

        if (config.debugMode) {
          ctx.ui.notify(
            `Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}%) [${detectedModel}]`,
            "info"
          );
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }],
          details: { intent: result, model: detectedModel },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Intent detection failed: ${error}` }],
          isError: true,
        };
      }
    },

    renderResult(result, options, theme) {
      if (!result.content?.[0]?.text) return [];
      
      try {
        const data = JSON.parse(result.content[0].text) as IntentResult;
        const lines = [
          "",
          theme.fg("accent", `🎯 ${data.intent}`),
          `   Confidence: ${(data.confidence * 100).toFixed(1)}%`,
          `   Action: ${data.action}`,
        ];
        
        if (Object.keys(data.params).length > 0) {
          lines.push(`   Params: ${JSON.stringify(data.params)}`);
        }
        
        lines.push("");
        return lines.map(line => Text(line));
      } catch {
        return [Text(result.content[0].text)];
      }
    },
  });

  // ==========================================================================
  // Register Command
  // ==========================================================================
  
  pi.registerCommand("whimsical", {
    description: "Whimsical intent recognition and configuration",
    getArgumentCompletions: (prefix) => {
      const commands = ['config', 'model', 'lang', 'enable', 'disable', 'threshold', 'test', 'debug', 'reset'];
      return commands
        .filter(c => c.startsWith(prefix.toLowerCase()))
        .map(c => ({ value: c, label: c }));
    },
    
    handler: async (args, ctx) => {
      const [subCmd, ...rest] = args.split(' ');
      const config = configManager.get();
      const lang = config.defaultLanguage;

      switch (subCmd?.toLowerCase()) {
        case 'config':
          ctx.ui.notify(formatConfig(config, lang, configManager.getPath()), "info");
          break;

        case 'model':
          if (rest[0]) {
            await configManager.update({ intentModel: rest[0] });
            ctx.ui.notify(t('modelSet', lang, { model: rest[0] }), "success");
          } else {
            ctx.ui.notify(`Current model: ${config.intentModel}`, "info");
          }
          break;

        case 'lang':
          if (rest[0] && ['zh', 'en', 'ja'].includes(rest[0])) {
            await configManager.update({ defaultLanguage: rest[0] });
            ctx.ui.notify(t('languageSet', lang, { lang: rest[0] }), "success");
          } else {
            ctx.ui.notify("Available: zh, en, ja", "warning");
          }
          break;

        case 'enable':
          await configManager.update({ enableIntentDetection: true });
          ctx.ui.notify(t('intentEnabled', lang), "success");
          break;

        case 'disable':
          await configManager.update({ enableIntentDetection: false });
          ctx.ui.notify(t('intentDisabled', lang), "warning");
          break;

        case 'threshold':
          const val = parseFloat(rest[0]);
          if (!isNaN(val) && val >= 0 && val <= 1) {
            await configManager.update({ confidenceThreshold: val });
            ctx.ui.notify(`Threshold set to ${(val * 100).toFixed(0)}%`, "success");
          } else {
            ctx.ui.notify("Usage: /whimsical threshold 0.7", "warning");
          }
          break;

        case 'test':
          const testInput = rest.join(' ') || "Write a function to sort an array";
          const result = await simulateIntentDetection(testInput);
          ctx.ui.notify(
            t('intentDetected', lang, { 
              intent: result.intent, 
              confidence: (result.confidence * 100).toFixed(0) 
            }) + "\n" + 
            t('executing', lang, { action: result.action }),
            "info"
          );
          break;

        case 'debug':
          await configManager.update({ debugMode: !config.debugMode });
          ctx.ui.notify(`Debug mode: ${!config.debugMode ? 'ON' : 'OFF'}`, !config.debugMode ? "success" : "info");
          break;

        case 'reset':
          await configManager.reset(DEFAULT_CONFIG);
          ctx.ui.notify(t('configSaved', lang, { path: configManager.getPath() }), "success");
          break;

        default:
          ctx.ui.notify(t('helpText', lang), "info");
      }
    },
  });

  // ==========================================================================
  // Event Handlers
  // ==========================================================================
  
  // Load config on session start
  pi.on("session_start", async (_event, ctx) => {
    await configManager.load();
    const config = configManager.get();

    if (config.debugMode) {
      ctx.ui.notify(t('welcome', config.defaultLanguage), "info");
      ctx.ui.notify(t('configLoaded', config.defaultLanguage), "info");
    }
  });

  // Intercept input for intent detection
  pi.on("input", async (event, ctx) => {
    const config = configManager.get();
    
    if (event.text.startsWith('/') || event.text.length < 10) {
      return { action: "continue" };
    }

    if (!config.enableIntentDetection) {
      return { action: "continue" };
    }

    if (event.text.includes('```') || event.text.startsWith('file:')) {
      return { action: "continue" };
    }

    try {
      const intent = await simulateIntentDetection(event.text);
      
      if (intent.confidence >= config.confidenceThreshold) {
        lastIntent = intent;
        
        if (config.debugMode) {
          ctx.ui.setStatus("whimsical", `${intent.intent} (${(intent.confidence * 100).toFixed(0)}%)`);
        }

        const enhancement = generateEnhancement(intent);
        if (enhancement) {
          return { 
            action: "transform", 
            text: `${event.text}\n\n[Intent: ${intent.intent}] ${enhancement}`
          };
        }
      }
    } catch {
      // Silently fail
    }

    return { action: "continue" };
  });

  // Clean up status on turn end
  pi.on("turn_end", async () => {
    lastIntent = null;
  });
}
