---
name: macos-osascript
description: 在 macOS 上使用 osascript 执行 AppleScript 或 JavaScript for Automation (JXA) 实现系统自动化。当用户需要控制 macOS 应用（Finder、Safari、Mail、Calendar、Keynote、Numbers、Pages 等）、操作系统 UI、显示对话框/通知、读写剪贴板、自动化重复任务、或任何涉及 osascript/AppleScript/JXA 的需求时，必须使用本技能。即使用户只说"帮我自动化这个"或"在 Mac 上操作 XXX"，也应优先考虑本技能。
compatibility: "macOS only — requires bash_tool for osascript execution"
---

# macOS osascript 自动化技能

## 目录

1. [概览](#概览)
2. [执行方式](#执行方式)
3. [AppleScript 核心语法](#applescript-核心语法)
4. [JXA 核心语法](#jxa-核心语法)
5. [常用场景速查](#常用场景速查)
   - [5.1 对话框与通知](#1-对话框与通知)
   - [5.2 剪贴板操作](#2-剪贴板操作)
   - [5.3 Finder 文件操作](#3-finder-文件操作)
   - [5.4 Safari / 浏览器控制](#4-safari--浏览器控制)
   - [5.5 Mail 邮件操作](#5-mail-邮件操作)
   - [5.6 系统 UI 自动化](#6-系统-ui-自动化)
   - [5.7 日历](#7-日历)
   - [5.8 Numbers / 数据处理](#8-numbers--数据处理)
   - [5.9 终端/Shell 命令](#9-终端shell-命令)
6. [高级场景](#高级场景)
   - [6.1 窗口管理](#61-窗口管理)
   - [6.2 音频设备控制](#62-音频设备控制)
   - [6.3 蓝牙与网络](#63-蓝牙与网络)
   - [6.4 屏幕与截图](#64-屏幕与截图)
   - [6.5 系统监控](#65-系统监控)
   - [6.6 文件系统监控](#66-文件系统监控)
   - [6.7 压缩与镜像](#67-压缩与镜像)
   - [6.8 时间机器](#68-时间机器)
   - [6.9 安全与签名](#69-安全与签名)
   - [6.10 语音合成](#610-语音合成)
7. [错误处理](#错误处理)
8. [返回值处理](#返回值处理)
9. [权限与安全](#权限与安全注意事项)
10. [调试技巧](#调试技巧)
11. [工作流建议](#工作流建议)
12. [应用 API 词典](./references/app-dictionaries.md)

## 概览

`osascript` 是 macOS 内置的脚本运行器，支持两种语言：
- **AppleScript**：传统脚本语言，语法接近英语，兼容性最佳
- **JXA**（JavaScript for Automation）：现代 JS 语法，更灵活，适合复杂逻辑

## 执行方式

### 基本调用
```bash
# AppleScript（默认）
osascript -e 'tell application "Finder" to activate'

# JXA
osascript -l JavaScript -e 'Application("Finder").activate()'

# 执行脚本文件
osascript /path/to/script.applescript
osascript -l JavaScript /path/to/script.js
```

### 通过 bash_tool 执行
```python
# 推荐：heredoc 方式，适合多行脚本
bash_tool("""osascript << 'EOF'
tell application "Safari"
    activate
    open location "https://example.com"
end tell
EOF""")
```

---

## AppleScript 核心语法

### 基础结构
```applescript
-- 单行注释
(*
  多行注释
*)

-- 变量
set myVar to "Hello"
set myNum to 42
set myList to {1, 2, 3}

-- 条件
if myNum > 10 then
    display dialog "大于10"
else
    display dialog "不大于10"
end if

-- 循环
repeat with i from 1 to 5
    log i
end repeat

repeat with item in myList
    log item
end repeat

-- 函数
on greet(name)
    return "Hello, " & name
end greet
```

### Tell 块（控制应用）
```applescript
tell application "应用名"
    -- 在此块内的命令发送给该应用
    activate          -- 激活/置前
    quit              -- 退出
end tell

-- 嵌套 tell（操作应用内的元素）
tell application "Finder"
    tell front window
        set current view to list view
    end tell
end tell
```

---

## JXA 核心语法

### 基础结构
```javascript
// 获取应用引用
const app = Application("Finder")
const safari = Application("Safari")

// 当前应用（脚本编辑器/osascript 自身）
const app = Application.currentApplication()
app.includeStandardAdditions = true  // 启用标准附加功能（对话框、通知等）

// 激活应用
safari.activate()

// 系统事件（UI 自动化）
const se = Application("System Events")
```

---

## 常用场景速查

### 1. 对话框与通知

**AppleScript:**
```applescript
-- 显示对话框
display dialog "请输入名字：" default answer "张三" with title "输入"
set userName to text returned of result

-- 确认对话框
set choice to button returned of (display dialog "确定继续？" buttons {"取消", "确定"} default button "确定")

-- 通知
display notification "任务完成！" with title "提醒" subtitle "成功"

-- 选择文件
set theFile to choose file with prompt "请选择文件："
set filePath to POSIX path of theFile

-- 选择文件夹
set theFolder to choose folder with prompt "请选择文件夹："
```

**JXA:**
```javascript
const app = Application.currentApplication()
app.includeStandardAdditions = true

// 对话框
const result = app.displayDialog("请输入名字：", {
    defaultAnswer: "张三",
    withTitle: "输入",
    buttons: ["取消", "确定"],
    defaultButton: "确定"
})
const userName = result.textReturned

// 通知
app.displayNotification("任务完成！", {
    withTitle: "提醒",
    subtitle: "成功"
})
```

### 2. 剪贴板操作

```applescript
-- 读取剪贴板
set clipContent to the clipboard

-- 写入剪贴板
set the clipboard to "新内容"

-- 读取特定类型
set clipText to the clipboard as text
```

```javascript
// JXA
const app = Application.currentApplication()
app.includeStandardAdditions = true
const clip = app.theClipboard()
app.setTheClipboardTo("新内容")
```

### 3. Finder 文件操作

```applescript
tell application "Finder"
    -- 获取桌面路径
    set desktopPath to POSIX path of (path to desktop)
    
    -- 创建文件夹
    make new folder at desktop with properties {name:"新文件夹"}
    
    -- 移动文件
    move file "Macintosh HD:Users:user:file.txt" to trash
    
    -- 获取选中文件
    set selectedItems to selection
    repeat with f in selectedItems
        log POSIX path of (f as alias)
    end repeat
    
    -- 打开文件
    open POSIX file "/Users/user/document.pdf"
end tell
```

### 4. Safari / 浏览器控制

```applescript
tell application "Safari"
    activate
    -- 打开 URL
    open location "https://www.example.com"
    
    -- 获取当前页面 URL 和标题
    set currentURL to URL of current tab of front window
    set pageTitle to name of current tab of front window
    
    -- 执行 JavaScript
    do JavaScript "document.title" in current tab of front window
    
    -- 新建标签页
    tell front window
        set newTab to make new tab
        set URL of newTab to "https://www.google.com"
    end tell
end tell
```

### 5. Mail 邮件操作

```applescript
tell application "Mail"
    -- 创建新邮件
    set newMsg to make new outgoing message with properties {
        subject: "测试邮件",
        content: "这是邮件正文",
        visible: true
    }
    tell newMsg
        make new to recipient with properties {
            name: "收件人",
            address: "recipient@example.com"
        }
    end tell
    -- 发送
    send newMsg
end tell
```

### 6. 系统 UI 自动化（System Events）

```applescript
tell application "System Events"
    -- 按键
    keystroke "c" using {command down}   -- Cmd+C
    key code 36                           -- 回车键
    
    -- 点击菜单栏
    tell process "Finder"
        click menu item "新建文件夹" of menu "文件" of menu bar 1
    end tell
    
    -- 获取所有运行中的应用
    set runningApps to name of every process whose background only is false
end tell
```

```applescript
-- 模拟点击 UI 元素
tell application "System Events"
    tell process "Calculator"
        click button "1"
        click button "+"
        click button "2"
        click button "="
    end tell
end tell
```

### 7. 日历（Calendar）

```applescript
tell application "Calendar"
    -- 创建事件
    tell calendar "工作"
        make new event with properties {
            summary: "团队会议",
            start date: date "2024-01-15 14:00",
            end date: date "2024-01-15 15:00",
            description: "季度复盘"
        }
    end tell
end tell
```

### 8. 终端/Shell 命令

```applescript
-- 在 AppleScript 中执行 shell 命令
set result to do shell script "ls -la ~/Desktop"
set result to do shell script "python3 /path/to/script.py"

-- 需要管理员权限
do shell script "sudo command" with administrator privileges
```

### 9. Numbers / 数据处理

```applescript
tell application "Numbers"
    tell front document
        tell active sheet
            tell table 1
                -- 读取单元格
                set cellVal to value of cell "A1"
                -- 写入单元格
                set value of cell "B1" to 42
                -- 获取行数
                set rowCount to row count
            end tell
        end tell
    end tell
end tell
```

---

## 高级场景

### 6.1 窗口管理

```applescript
-- 调整窗口大小/位置
tell application "System Events"
    tell process "Code"
        set position of front window to {100, 100}
        set size of front window to {800, 600}
    end tell
end tell

-- 最小化所有窗口
tell application "System Events"
    keystroke "m" using command down
end tell

-- 获取屏幕分辨率
tell application "Finder"
    get bounds of window of desktop
end tell
```

### 6.2 音频设备控制

```bash
# 需要: brew install switchaudio-osx
```

```applescript
-- 获取当前输出设备
set currentDevice to do shell script "SwitchAudioSource -c"

-- 切换音频输出
do shell script "SwitchAudioSource -s \"MacBook Pro Speakers\""

-- 设置音量
set volume output volume 50
set volume input volume 30
```

### 6.3 蓝牙与网络

```bash
# 需要: brew install blueutil
```

```applescript
-- 蓝牙开关
do shell script "blueutil --power 1"  -- 开启
do shell script "blueutil --power 0"  -- 关闭

-- 列出配对设备
set pairedDevices to do shell script "blueutil --paired"

-- 获取 WiFi 状态
set wifiStatus to do shell script "airport -I | grep state | awk '{print $2}'"

-- 切换 WiFi
do shell script "networksetup -setairportpower en0 on"

-- 获取 IP
set myIP to do shell script "ifconfig | grep inet | grep -v inet6 | awk '{print $2}' | head -1"
```

### 6.4 屏幕与截图

```applescript
-- 截屏到剪贴板
do shell script "screencapture -c"

-- 选择区域截屏
do shell script "screencapture -i ~/Desktop/cap.png"

-- 全屏截屏带阴影
do shell script "screencapture -x ~/Desktop/fullscreen.png"

-- 定时截屏
do shell script "screencapture -T 5 ~/Desktop/delay.png"
```

### 6.5 系统监控

```applescript
-- CPU 负载
set cpuLoad to do shell script "uptime | awk -F'load averages: ' '{print $2}'"

-- 内存压力
set memoryFree to do shell script "memory_pressure | grep 'System-wide memory free percentage' | awk '{print $5}'"

-- 电池状态
set batteryPercent to do shell script "pmset -g batt | grep -Eo '[0-9]+%' | head -1"

-- 磁盘空间
set freeSpace to do shell script "df -h / | tail -1 | awk '{print $4}'"

-- 获取硬件信息
set serialNumber to do shell script "system_profiler SPHardwareDataType | grep 'Serial Number' | awk '{print $4}'"
set cpuInfo to do shell script "sysctl -n machdep.cpu.brand_string"
```

### 6.6 文件系统监控

```applescript
-- 使用 fswatch 监控目录变化 (需要: brew install fswatch)
do shell script "fswatch -1 /path/to/watch && echo 'Changed'"

-- 获取文件扩展属性
set xattr to do shell script "xattr -l /path/to/file"

-- Spotlight 搜索
set searchResults to do shell script "mdfind 'kind:image && kMDItemPixelHeight > 2000'"

-- 获取文件元数据
set createDate to do shell script "mdls -n kMDItemContentCreationDate /path/to/file"
```

### 6.7 压缩与镜像

```applescript
-- 创建加密压缩包
do shell script "zip -e -r secure.zip folder/"

-- 解压特定文件
do shell script "unzip -j archive.zip 'specific/file.txt' -d /tmp/"

-- 创建 DMG 镜像
do shell script "hdiutil create -srcfolder /path/to/folder -volname Name output.dmg"

-- 挂载 DMG
do shell script "hdiutil attach output.dmg"

-- 卸载 DMG
do shell script "hdiutil detach /Volumes/Name"

-- 转换 DMG 格式
do shell script "hdiutil convert input.dmg -format UDZO -o compressed.dmg"
```

### 6.8 时间机器

```applescript
-- 开始备份
do shell script "tmutil startbackup"

-- 排除文件
do shell script "tmutil addexclusion /path/to/folder"

-- 查看备份状态
set backupStatus to do shell script "tmutil status"

-- 列出备份历史
set backupList to do shell script "tmutil listbackups"

-- 恢复快照
do shell script "tmutil restore /path/to/backup/file /destination/"
```

### 6.9 安全与签名

```applescript
-- 代码签名检查
set codesignInfo to do shell script "codesign -dv /Applications/App.app 2>&1 | head -10"

-- 检查 SIP 状态
set sipStatus to do shell script "csrutil status"

-- 检查 Gatekeeper
set gatekeeper to do shell script "spctl --status"

-- 公证状态查询 (需要配置 keychain profile)
set notarization to do shell script "xcrun notarytool history --keychain-profile AC_PROFILE 2>&1 | head -5"
```

### 6.10 语音合成

```applescript
-- 朗读文本
say "Hello World"

-- 指定语音/速度
say "Hello" using "Samantha" speaking rate 150

-- 保存为音频文件
say "Hello World" saving to alias "Macintosh HD:Users:name:Desktop:out.aiff"

-- 列出可用语音
set voices to do shell script "say -v '?' | cut -d ' ' -f 1-2"

-- 中文语音
say "你好世界" using "Ting-Ting"
```

---

## 错误处理

### AppleScript
```applescript
try
    -- 可能出错的代码
    tell application "Safari"
        set x to URL of current tab of front window
    end tell
on error errMsg number errNum
    display dialog "错误 " & errNum & ": " & errMsg
end try
```

### JXA
```javascript
try {
    const safari = Application("Safari")
    const url = safari.windows[0].currentTab.url()
} catch(e) {
    console.log("错误: " + e.message)
}
```

---

## 返回值处理

osascript 的输出会打印到 stdout，bash_tool 可捕获：

```bash
# 返回值自动输出到 stdout
result=$(osascript -e 'return "Hello World"')
echo $result  # Hello World

# 多行返回（列表用逗号分隔）
osascript -e 'return {"apple", "banana", "cherry"}'
# 输出: apple, banana, cherry
```

---

## 权限与安全注意事项

1. **首次运行需要授权**：System Events、辅助功能控制等需在「系统设置 → 隐私与安全 → 辅助功能」中授权终端/应用
2. **沙盒限制**：Mac App Store 应用可能限制 AppleScript 访问
3. **权限检测**：
```applescript
tell application "System Events"
    if UI elements enabled then
        -- 有辅助功能权限
    else
        display dialog "请在系统设置中开启辅助功能权限"
    end if
end tell
```

---

## 调试技巧

```bash
# 详细错误输出
osascript -e 'tell application "Finder" to ...' 2>&1

# 脚本编辑器日志（AppleScript）
log "调试信息: " & myVar

# JXA 控制台输出
console.log("调试:", someValue)

# 测试脚本是否有语法错误（不执行）
osacompile -o /dev/null script.applescript
```

---

## 工作流建议

1. **简单单行操作** → 用 `-e` 参数直接执行
2. **多步骤自动化** → 写成脚本文件，用 `osascript` 执行
3. **需要用户交互** → 用 `display dialog` 收集输入
4. **应用 UI 无 AppleScript 支持** → 改用 `System Events` 模拟鼠标键盘
5. **复杂数据处理** → 用 JXA（JS 语法更灵活）配合 `do shell script` 调用 Python/Ruby

详细的应用专属 API 请参考：`references/app-dictionaries.md`
