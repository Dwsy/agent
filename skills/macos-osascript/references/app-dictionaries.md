# macOS 应用 AppleScript 字典速查

## 目录
1. [Finder](#finder)
2. [Safari](#safari)
3. [Mail](#mail)
4. [Calendar](#calendar)
5. [Contacts](#contacts)
6. [Messages](#messages)
7. [Music / iTunes](#music)
8. [Keynote](#keynote)
9. [Numbers](#numbers)
10. [Pages](#pages)
11. [Terminal](#terminal)
12. [Spotify](#spotify)

---

## Finder

```applescript
tell application "Finder"
    -- 窗口
    front window                    -- 最前窗口
    make new Finder window          -- 新建窗口
    set target of front window to desktop

    -- 路径转换
    POSIX path of (path to desktop)               -- 桌面路径字符串
    POSIX file "/Users/user/file.txt"             -- 字符串转 Finder 路径
    (POSIX file "/path/to/folder") as alias       -- 转为 alias 类型

    -- 文件/文件夹操作
    duplicate file "..." to folder "..."
    move file "..." to trash
    delete item "..."                             -- 永久删除
    exists file "/path/to/file"                  -- 检查存在性

    -- 选中项
    selection                                     -- 当前选中的项目列表
    select file "..."                             -- 选中文件

    -- 排序与视图
    set current view of front window to list view   -- icon view / list view / column view / flow view
    set sort column of list view options of front window to modification date column
end tell
```

---

## Safari

```applescript
tell application "Safari"
    -- 窗口与标签
    front window
    current tab of front window
    tabs of front window            -- 所有标签页列表
    
    -- 导航
    open location "https://..."
    do JavaScript "window.scrollTo(0,0)" in current tab of front window
    
    -- 获取信息
    URL of current tab of front window
    name of current tab of front window   -- 页面标题
    source of current tab of front window -- 页面 HTML 源码
    
    -- 标签操作
    make new tab                          -- 新标签
    close current tab of front window
    set URL of current tab of front window to "https://..."
    
    -- 历史与书签
    -- (受沙盒限制，部分功能需要特权)
end tell
```

---

## Mail

```applescript
tell application "Mail"
    -- 邮件账户
    accounts                        -- 所有账户
    name of account 1

    -- 邮箱
    mailboxes of account 1
    inbox                           -- 收件箱（快捷方式）
    
    -- 邮件列表
    messages of inbox
    subject of message 1 of inbox
    sender of message 1 of inbox
    content of message 1 of inbox
    date received of message 1 of inbox
    read status of message 1 of inbox
    
    -- 筛选
    messages of inbox whose read status is false   -- 未读邮件
    
    -- 创建并发送
    set msg to make new outgoing message with properties {
        subject: "主题",
        content: "正文\n第二行",
        visible: true
    }
    tell msg
        make new to recipient with properties {address: "a@b.com"}
        make new cc recipient with properties {address: "c@d.com"}
        make new bcc recipient with properties {address: "e@f.com"}
        -- 附件
        make new attachment with properties {file name: POSIX file "/path/to/file.pdf"}
    end tell
    send msg
    
    -- 回复
    reply message 1 of inbox opening window yes
end tell
```

---

## Calendar

```applescript
tell application "Calendar"
    -- 日历列表
    calendars
    name of calendars
    
    -- 获取事件
    tell calendar "工作"
        events
        -- 按时间筛选
        events whose start date is greater than (current date - 7 * days)
    end tell
    
    -- 事件属性
    summary of event 1       -- 标题
    start date of event 1
    end date of event 1
    description of event 1
    location of event 1
    all day event of event 1
    
    -- 创建事件
    tell calendar "个人"
        set newEvent to make new event with properties {
            summary: "生日派对",
            start date: date "Saturday, January 20, 2024 at 7:00:00 PM",
            end date: date "Saturday, January 20, 2024 at 10:00:00 PM",
            location: "朋友家",
            description: "带蛋糕"
        }
        -- 添加提醒
        make new display alarm for newEvent with properties {trigger interval: -30}  -- 提前30分钟
    end tell
    
    -- 日期处理
    set d to current date
    set year of d to 2024
    set month of d to January
    set day of d to 15
    set time of d to 14 * hours  -- 下午2点
end tell
```

---

## Contacts（通讯录）

```applescript
tell application "Contacts"
    -- 搜索联系人
    people whose name contains "张"
    
    -- 获取属性
    set p to person 1
    name of p
    first name of p
    last name of p
    -- 电话（多个）
    value of phone 1 of p
    label of phone 1 of p    -- "mobile" / "work" / "home"
    -- 邮箱
    value of email 1 of p
    
    -- 新建联系人
    set newPerson to make new person with properties {
        first name: "三",
        last name: "张"
    }
    tell newPerson
        make new phone with properties {label: "mobile", value: "138xxxx0000"}
        make new email with properties {label: "work", value: "zhang@company.com"}
    end tell
    save  -- 保存更改
end tell
```

---

## Messages（信息）

```applescript
tell application "Messages"
    -- 获取服务和聊天
    services
    chats
    
    -- 发送消息（iMessage）
    set targetService to 1st service whose service type = iMessage
    send "你好！" to buddy "phone@example.com" of targetService
    
    -- 发送给电话号码
    send "Hello" to buddy "+8613800138000" of targetService
end tell
```

---

## Music（原 iTunes）

```applescript
tell application "Music"
    -- 播放控制
    play
    pause
    stop
    next track
    previous track
    
    -- 当前曲目信息
    name of current track
    artist of current track
    album of current track
    duration of current track
    player position              -- 当前播放位置（秒）
    
    -- 音量
    sound volume                 -- 0-100
    set sound volume to 50
    
    -- 播放状态
    player state                 -- playing / paused / stopped
    
    -- 搜索
    search library playlist 1 for "Beatles"
    
    -- 播放列表
    user playlists
    play playlist "我的最爱"
    
    -- 添加到播放列表
    duplicate current track to playlist "我的最爱"
end tell
```

---

## Keynote

```applescript
tell application "Keynote"
    -- 打开/创建文档
    open POSIX file "/path/to/presentation.key"
    set doc to make new document with properties {document theme: theme "白色"}
    
    -- 幻灯片
    tell front document
        slides                           -- 所有幻灯片
        slide count                      -- 幻灯片数量
        current slide
        
        -- 添加幻灯片
        make new slide
        
        tell slide 1
            -- 文本框
            default title item           -- 标题占位符
            default body item            -- 正文占位符
            set object text of default title item to "演示标题"
            
            -- 所有元素
            every text item
            every image item
        end tell
        
        -- 导出为 PDF
        export to POSIX file "/path/output.pdf" as PDF
        -- 导出为 PowerPoint
        export to POSIX file "/path/output.pptx" as Microsoft PowerPoint
    end tell
    
    -- 放映
    start front document
    pause slideshow
    stop slideshow
end tell
```

---

## Numbers

```applescript
tell application "Numbers"
    -- 文档结构：document → sheet → table → cell
    tell front document
        tell active sheet
            tell table 1
                -- 读取
                value of cell "A1"
                value of cell 1 of row 1        -- 等价方式
                
                -- 写入
                set value of cell "B2" to 100
                set value of cell "C3" to "文本"
                
                -- 公式
                set formula of cell "D1" to "=SUM(A1:C1)"
                
                -- 格式
                set format of cell "B2" to percentage
                
                -- 范围
                row count
                column count
                
                -- 遍历
                repeat with r from 1 to row count
                    set cellVal to value of cell r of column 1
                    if cellVal is missing value then exit repeat
                    log cellVal
                end repeat
            end tell
        end tell
        
        -- 导出
        export to POSIX file "/path/output.xlsx" as Microsoft Excel
        export to POSIX file "/path/output.csv" as CSV
    end tell
end tell
```

---

## Pages

```applescript
tell application "Pages"
    tell front document
        -- 内容（纯文本方式）
        body text                        -- 整篇文档文字内容
        
        -- 段落
        paragraphs of body text
        
        -- 查找替换
        set text of body text to (do shell script "echo 'hello world'")
        
        -- 导出
        export to POSIX file "/path/output.docx" as Microsoft Word
        export to POSIX file "/path/output.pdf" as PDF
    end tell
end tell
```

---

## Terminal

```applescript
tell application "Terminal"
    -- 在新窗口执行命令
    do script "ls -la ~/Desktop"
    
    -- 在已有窗口执行
    do script "echo hello" in front window
    
    -- 新建标签页
    tell application "System Events"
        keystroke "t" using command down
    end tell
    
    -- 等待命令完成
    tell front window
        repeat while busy
            delay 0.5
        end repeat
        set output to contents of selected tab
    end tell
end tell
```

---

## Spotify

```applescript
tell application "Spotify"
    -- 播放控制
    play
    pause
    next track
    previous track
    
    -- 当前曲目
    name of current track
    artist of current track
    album of current track
    duration of current track    -- 毫秒
    
    -- 音量 (0.0 - 1.0)
    sound volume
    set sound volume to 0.7
    
    -- 播放状态
    player state                 -- playing / paused / stopped
    
    -- 打开 URI
    open location "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
    open location "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
end tell
```

---

## 常用系统路径

```applescript
-- 标准路径常量
path to desktop                -- 桌面
path to documents folder       -- 文稿
path to downloads folder       -- 下载
path to home folder            -- 用户主目录
path to applications folder    -- 应用程序
path to library folder         -- 资源库
path to temporary items        -- 临时目录

-- 转为 POSIX 路径（字符串）
POSIX path of (path to desktop)
-- 示例输出: /Users/username/Desktop/
```
