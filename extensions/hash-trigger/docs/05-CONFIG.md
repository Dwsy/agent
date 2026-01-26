# 配置系统设计

## 配置层级

```
默认配置 (内置)
    ↓
用户全局配置 (~/.pi/agent/extensions/hash-trigger/config.json)
    ↓
项目配置 (.pi/hash-trigger/config.json)
    ↓
环境变量 (HASH_TRIGGER_*)
```

## 配置文件格式

```json
{
  "enabled": true,
  
  "commands": {
    "file": {
      "enabled": true,
      "defaultPreview": true,
      "excludePatterns": ["node_modules", ".git"]
    },
    "search": {
      "enabled": true,
      "caseSensitive": false,
      "maxResults": 100
    },
    "git": {
      "enabled": true,
      "defaultBranch": "main"
    }
  },
  
  "tools": {
    "fzf": {
      "path": "/usr/local/bin/fzf",
      "options": ["--height", "40%", "--reverse"]
    },
    "rg": {
      "path": "/usr/local/bin/rg",
      "options": ["--smart-case"]
    },
    "fd": {
      "path": "/usr/local/bin/fd",
      "options": ["--hidden"]
    }
  },
  
  "ui": {
    "showToolStatus": true,
    "confirmBeforeExecute": false
  }
}
```

## 配置管理器

```typescript
class ConfigManager {
  private config: Config;
  
  async load(): Promise<void> {
    // 1. 加载默认配置
    const defaultConfig = this.getDefaultConfig();
    
    // 2. 加载用户配置
    const userConfig = await this.loadUserConfig();
    
    // 3. 加载项目配置
    const projectConfig = await this.loadProjectConfig();
    
    // 4. 合并配置
    this.config = this.merge(defaultConfig, userConfig, projectConfig);
    
    // 5. 应用环境变量
    this.applyEnvVars();
  }
  
  get<T>(key: string): T {
    return this.config[key];
  }
  
  set(key: string, value: any): void {
    this.config[key] = value;
  }
  
  async save(): Promise<void> {
    // 保存到用户配置文件
  }
}
```

## 配置验证

```typescript
interface ConfigSchema {
  enabled: boolean;
  commands: Record<string, CommandConfig>;
  tools: Record<string, ToolConfig>;
  ui: UIConfig;
}

function validateConfig(config: any): ConfigSchema {
  // 使用 zod 或 typebox 验证
  return configSchema.parse(config);
}
```

## 热重载

```typescript
class ConfigWatcher {
  private watcher: FSWatcher;
  
  watch(configPath: string, onChange: () => void): void {
    this.watcher = fs.watch(configPath, () => {
      onChange();
    });
  }
  
  stop(): void {
    this.watcher?.close();
  }
}
```

## 环境变量支持

```bash
# 禁用插件
HASH_TRIGGER_ENABLED=false

# 指定工具路径
HASH_TRIGGER_FZF_PATH=/custom/path/fzf

# 命令配置
HASH_TRIGGER_FILE_PREVIEW=true
```

## 配置命令

```bash
# 查看配置
#config

# 设置配置
#config set file.preview true

# 重置配置
#config reset
```

## 下一步

下一个文档将设计**扩展机制**，定义如何让用户添加自定义命令。
