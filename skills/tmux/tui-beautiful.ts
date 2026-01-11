#!/usr/bin/env bun
/**
 * Enhanced TUI with Beautiful Design
 * Improved spacing, layout, and visual design
 */

import { render } from 'ink';
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import { TmuxManager } from './lib.ts';
import { TUIConfigManager } from './config.ts';
import { FilterManager } from './filter.ts';
import type { TmuxSession, SessionStatus, SessionCategory } from './types/index.js';

interface AppProps {
  tmux: TmuxManager;
}

// Color themes
const THEMES = {
  default: {
    primary: 'green',
    secondary: 'cyan',
    accent: 'magenta',
    warning: 'yellow',
    error: 'red',
    success: 'green',
    muted: 'gray',
    border: 'blue',
    bg: 'blue',
  },
  dark: {
    primary: 'green',
    secondary: 'cyan',
    accent: 'magenta',
    warning: 'yellow',
    error: 'red',
    success: 'green',
    muted: 'gray',
    border: 'white',
    bg: 'black',
  },
  light: {
    primary: 'green',
    secondary: 'blue',
    accent: 'magenta',
    warning: 'yellow',
    error: 'red',
    success: 'green',
    muted: 'gray',
    border: 'black',
    bg: 'white',
  },
};

// Status colors and labels
const STATUS_CONFIG = {
  running: { color: 'green', label: '运行中', labelEn: 'Running', icon: '●' },
  idle: { color: 'yellow', label: '空闲', labelEn: 'Idle', icon: '○' },
  exited: { color: 'red', label: '已退出', labelEn: 'Exited', icon: '●' },
};

// Category colors and labels
const CATEGORY_CONFIG = {
  task: { color: 'cyan', label: '任务', labelEn: 'Task', icon: '📋' },
  service: { color: 'magenta', label: '服务', labelEn: 'Service', icon: '🔧' },
  agent: { color: 'blue', label: '代理', labelEn: 'Agent', icon: '🤖' },
};

function App({ tmux }: AppProps) {
  const { exit } = useApp();
  const { stdin, setRawMode } = useStdin();
  const configManager = new TUIConfigManager();
  const filterManager = new FilterManager();
  const theme = THEMES[configManager.get('colorTheme') as keyof typeof THEMES] || THEMES.default;
  
  useEffect(() => {
    if (stdin && stdin.isTTY) {
      setRawMode(true);
      return () => setRawMode(false);
    }
  }, [stdin, setRawMode]);

  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'create' | 'capture' | 'status' | 'attach' | 'confirm' | 'filter' | 'help'>('list');
  const [output, setOutput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('task');
  const [inputStep, setInputStep] = useState<'name' | 'command' | 'category'>('name');

  const refreshSessions = useCallback(async () => {
    await tmux.syncWithTmux();
    const list = await tmux.listSessions();
    setSessions(list);
  }, [tmux]);

  useEffect(() => {
    refreshSessions();
    const interval = setInterval(refreshSessions, configManager.get('refreshInterval') * 1000);
    return () => clearInterval(interval);
  }, [refreshSessions, configManager]);

  const filteredSessions = filterManager.apply(sessions);
  const filterSummary = filterManager.getFilterSummary(sessions);

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(filteredSessions.length - 1, prev + 1));
      } else if (input === 'r') {
        refreshSessions();
      } else if (input === 'q' || key.escape) {
        exit();
      } else if (input === 'f') {
        setMode('filter');
      } else if (input === 'h' || input === '?') {
        setMode('help');
      } else if (filteredSessions.length > 0) {
        if (input === 'k') setMode('confirm');
        else if (input === 'c') handleCapture();
        else if (input === 's') handleStatus();
        else if (input === 'a') handleAttach();
        else if (input === 'n') {
          setMode('create');
          setNameInput('');
          setCommandInput('');
          setCategoryInput('task');
          setInputStep('name');
        }
      }
    } else if (mode === 'confirm') {
      if (input === 'y') handleKill();
      else if (input === 'n' || key.escape) setMode('list');
    } else if (mode === 'create') {
      if (key.return) {
        if (inputStep === 'name' && nameInput) setInputStep('command');
        else if (inputStep === 'command' && commandInput) setInputStep('category');
        else if (inputStep === 'category') handleCreate();
      } else if (key.escape) setMode('list');
      else if (key.backspace || key.delete) {
        if (inputStep === 'name') setNameInput(prev => prev.slice(0, -1));
        else if (inputStep === 'command') setCommandInput(prev => prev.slice(0, -1));
        else if (inputStep === 'category') setCategoryInput(prev => prev.slice(0, -1));
      } else if (input.length === 1) {
        if (inputStep === 'name') setNameInput(prev => prev + input);
        else if (inputStep === 'command') setCommandInput(prev => prev + input);
        else if (inputStep === 'category') setCategoryInput(prev => prev + input);
      }
    } else if (mode === 'filter') {
      if (key.escape) setMode('list');
      else if (input === 'c') { filterManager.reset(); setMode('list'); }
      else if (input === '1') { filterManager.setCategory('task'); setMode('list'); }
      else if (input === '2') { filterManager.setCategory('service'); setMode('list'); }
      else if (input === '3') { filterManager.setCategory('agent'); setMode('list'); }
      else if (input === '4') { filterManager.setStatus('running'); setMode('list'); }
      else if (input === '5') { filterManager.setStatus('idle'); setMode('list'); }
      else if (input === '6') { filterManager.setStatus('exited'); setMode('list'); }
    } else if (mode === 'help') {
      if (key.escape) setMode('list');
    } else if (mode === 'capture' || mode === 'status' || mode === 'attach') {
      if (key.escape) {
        setMode('list');
        setOutput('');
      }
    }
  });

  const handleKill = async () => {
    if (filteredSessions[selectedIndex]) {
      await tmux.killSession(filteredSessions[selectedIndex].id);
      await refreshSessions();
      setMode('list');
    }
  };

  const handleCapture = async () => {
    if (filteredSessions[selectedIndex]) {
      const result = await tmux.capturePane(filteredSessions[selectedIndex].target, configManager.get('maxOutputLines'));
      setOutput(result);
      setMode('capture');
    }
  };

  const handleStatus = async () => {
    if (filteredSessions[selectedIndex]) {
      const session = filteredSessions[selectedIndex];
      const status = await tmux.getSessionStatus(session.target);
      const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.running;
      const categoryInfo = CATEGORY_CONFIG[session.category] || CATEGORY_CONFIG.task;
      
      setOutput(
        ` ${statusInfo.icon} 会话信息 / Session Information\n\n` +
        ` ┌─ ID / Session ID\n` +
        ` │  ${session.id}\n\n` +
        ` ┌─ 名称 / Name\n` +
        ` │  ${session.name}\n\n` +
        ` ┌─ 分类 / Category\n` +
        ` │  ${categoryInfo.icon} ${categoryInfo.label} / ${categoryInfo.labelEn}\n\n` +
        ` ┌─ 状态 / Status\n` +
        ` │  ${statusInfo.icon} ${statusInfo.label} / ${statusInfo.labelEn}\n\n` +
        ` ┌─ 创建时间 / Created\n` +
        ` │  ${session.createdAt}\n\n` +
        ` ┌─ 最后活动 / Last Activity\n` +
        ` │  ${session.lastActivityAt}\n\n` +
        ` ┌─ 命令 / Command\n` +
        ` │  ${session.command}`
      );
      setMode('status');
    }
  };

  const handleAttach = async () => {
    if (filteredSessions[selectedIndex]) {
      const session = filteredSessions[selectedIndex];
      setOutput(
        ` 🔗 连接命令 / Attach Command\n\n` +
        ` ┌─ 要连接到此会话，请运行 / To attach to this session, run:\n\n` +
        ` │  tmux -S ${session.socket} attach -t ${session.id}\n\n` +
        ` ┌─ 断开连接 / Detach:\n\n` +
        ` │  Ctrl+b d`
      );
      setMode('attach');
    }
  };

  const handleCreate = async () => {
    if (nameInput && commandInput) {
      await tmux.createSession(nameInput, commandInput, categoryInput as any);
      await refreshSessions();
      setMode('list');
      setNameInput('');
      setCommandInput('');
    }
  };

  const formatAge = (dateStr: string) => {
    const age = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    return age < 60 ? `${age}分钟/minutes` : `${Math.floor(age / 60)}小时/hours`;
  };

  const truncateId = (id: string) => {
    return id.length > 32 ? id.slice(0, 29) + '...' : id;
  };

  const truncateCommand = (cmd: string) => {
    return cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd;
  };

  // Render filter interface
  if (mode === 'filter') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 1 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.accent, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.accent }, ' 🔍 过滤器 / Filter ')
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.warning }, `  当前过滤 / Current Filter:`),
        React.createElement(Text, { color: theme.muted }, `    ${filterSummary}`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  按分类过滤 / Filter by Category:`),
        React.createElement(Text, { color: theme.muted }, `    [1] ${CATEGORY_CONFIG.task.icon} ${CATEGORY_CONFIG.task.label}`),
        React.createElement(Text, { color: theme.muted }, `    [2] ${CATEGORY_CONFIG.service.icon} ${CATEGORY_CONFIG.service.label}`),
        React.createElement(Text, { color: theme.muted }, `    [3] ${CATEGORY_CONFIG.agent.icon} ${CATEGORY_CONFIG.agent.label}`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  按状态过滤 / Filter by Status:`),
        React.createElement(Text, { color: theme.muted }, `    [4] ${STATUS_CONFIG.running.icon} ${STATUS_CONFIG.running.label}`),
        React.createElement(Text, { color: theme.muted }, `    [5] ${STATUS_CONFIG.idle.icon} ${STATUS_CONFIG.idle.label}`),
        React.createElement(Text, { color: theme.muted }, `    [6] ${STATUS_CONFIG.exited.icon} ${STATUS_CONFIG.exited.label}`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  其他 / Other:`),
        React.createElement(Text, { color: theme.muted }, `    [c] 清除过滤 / Clear filter`),
        React.createElement(Text, { color: theme.muted }, `    [Esc] 返回 / Return`),
      ),
    );
  }

  // Render help interface
  if (mode === 'help') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 1 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.accent, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.accent }, ' ❓ 帮助 / Help ')
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  导航 / Navigation:`),
        React.createElement(Text, { color: theme.muted }, `    [↑↓] 选择会话 / Select session`),
        React.createElement(Text, { color: theme.muted }, `    [r]   刷新列表 / Refresh list`),
        React.createElement(Text, { color: theme.muted }, `    [f]   过滤器 / Filter`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  会话操作 / Session Actions:`),
        React.createElement(Text, { color: theme.muted }, `    [n] 新建会话 / New session`),
        React.createElement(Text, { color: theme.muted }, `    [c] 捕获输出 / Capture output`),
        React.createElement(Text, { color: theme.muted }, `    [s] 显示状态 / Show status`),
        React.createElement(Text, { color: theme.muted }, `    [a] 连接命令 / Attach command`),
        React.createElement(Text, { color: theme.muted }, `    [k] 终止会话 / Kill session`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  其他 / Other:`),
        React.createElement(Text, { color: theme.muted }, `    [h?] 帮助 / Help`),
        React.createElement(Text, { color: theme.muted }, `    [q/Esc] 退出 / Exit`),
      ),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(Text, { color: theme.muted }, `  按 Esc 返回 / Press Esc to return`),
      ),
    );
  }

  // Render create interface
  if (mode === 'create') {
    const inputLabel = inputStep === 'name' ? '名称 / Name' : inputStep === 'command' ? '命令 / Command' : '分类 / Category';
    const inputValue = inputStep === 'name' ? nameInput : inputStep === 'command' ? commandInput : categoryInput;
    const placeholder = inputStep === 'category' ? '(任务/服务/代理 / Task/Service/Agent)' : '';
    const isActive = inputStep === 'name' ? nameInput.length > 0 : inputStep === 'command' ? commandInput.length > 0 : categoryInput.length > 0;

    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 2 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.primary, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.primary }, ' ➕ 创建新会话 / Create New Session ')
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Box, { gap: 1 },
          React.createElement(Text, { color: inputStep === 'name' ? theme.secondary : theme.muted, bold: inputStep === 'name' }, ' 名称 / Name: '),
          React.createElement(Text, { color: inputStep === 'name' ? 'white' : theme.muted }, nameInput || (inputStep === 'name' ? '█' : '')),
        ),
        React.createElement(Box, { gap: 1 },
          React.createElement(Text, { color: inputStep === 'command' ? theme.secondary : theme.muted, bold: inputStep === 'command' }, ' 命令 / Command: '),
          React.createElement(Text, { color: inputStep === 'command' ? 'white' : theme.muted }, commandInput || (inputStep === 'command' ? '█' : '')),
        ),
        React.createElement(Box, { gap: 1 },
          React.createElement(Text, { color: inputStep === 'category' ? theme.secondary : theme.muted, bold: inputStep === 'category' }, ' 分类 / Category: '),
          React.createElement(Text, { color: inputStep === 'category' ? 'white' : theme.muted }, categoryInput || (inputStep === 'category' ? '█' : '')),
          React.createElement(Text, { color: theme.muted }, ` ${placeholder}`),
        ),
      ),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(Text, { color: theme.muted }, `  按 Enter 继续 / Press Enter to ${isActive ? '继续 / continue' : '输入内容 / enter content'}，按 Esc 取消 / Press Esc to cancel`),
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.secondary, paddingX: 1 },
        React.createElement(Text, { color: theme.secondary }, ' > '),
        React.createElement(Text, { color: 'white' }, inputValue),
        React.createElement(Text, { color: theme.secondary, inverse: true }, ' '),
      ),
    );
  }

  // Render confirm interface
  if (mode === 'confirm') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 2 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.error, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.error }, ' ⚠️ 确认终止 / Confirm Kill ')
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.warning }, `  确定要终止以下会话吗？`),
        React.createElement(Text, { color: theme.muted }, `  Are you sure you want to kill session:`),
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.warning, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { color: theme.warning }, `  ${filteredSessions[selectedIndex]?.id || ''}`),
      ),
      React.createElement(Box, { flexDirection: 'column', gap: 1, paddingLeft: 2 },
        React.createElement(Text, { color: theme.secondary }, `  [Y] 是 / Yes`),
        React.createElement(Text, { color: theme.muted }, `  [N] 否 / No`),
      ),
    );
  }

  // Render capture interface
  if (mode === 'capture') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 1 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.primary, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.primary }, ' 📤 捕获输出 / Capture Output ')
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.secondary, padding: 1 },
        React.createElement(Text, { color: theme.secondary }, `  ${filteredSessions[selectedIndex]?.id || ''}`),
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.muted, padding: 1, flexDirection: 'column' },
        output.split('\n').map((line, i) => 
          React.createElement(Text, { key: i, color: i > 100 ? theme.muted : 'white' }, `  ${line}`)
        )
      ),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(Text, { color: theme.muted }, `  按 Esc 返回 / Press Esc to return`),
      ),
    );
  }

  // Render status interface
  if (mode === 'status') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 1 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.primary, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.primary }, ' ℹ️ 会话状态 / Session Status ')
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.muted, padding: 1, flexDirection: 'column' },
        output.split('\n').map((line, i) => 
          React.createElement(Text, { key: i, color: 'white' }, line)
        )
      ),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(Text, { color: theme.muted }, `  按 Esc 返回 / Press Esc to return`),
      ),
    );
  }

  // Render attach interface
  if (mode === 'attach') {
    return React.createElement(Box, { flexDirection: 'column', padding: 2, gap: 1 },
      React.createElement(Box, { borderStyle: 'double', borderColor: theme.primary, paddingX: 2, paddingY: 1 },
        React.createElement(Text, { bold: true, color: theme.primary }, ' 🔗 连接命令 / Attach Command ')
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.secondary, padding: 1 },
        React.createElement(Text, { color: theme.secondary }, `  ${filteredSessions[selectedIndex]?.id || ''}`),
      ),
      React.createElement(Box, { borderStyle: 'single', borderColor: theme.muted, padding: 1, flexDirection: 'column' },
        output.split('\n').map((line, i) => 
          React.createElement(Text, { key: i, color: 'white' }, line)
        )
      ),
      React.createElement(Box, { paddingLeft: 2 },
        React.createElement(Text, { color: theme.muted }, `  按 Esc 返回 / Press Esc to return`),
      ),
    );
  }

  // Render main list interface
  const hasFilters = filterManager.getFilters().category !== 'all' || 
                     filterManager.getFilters().status !== 'all' ||
                     (filterManager.getFilters().searchQuery || '').trim() !== '';

  return React.createElement(Box, { flexDirection: 'column', padding: 1, gap: 1 },
    // Header
    React.createElement(Box, { borderStyle: 'double', borderColor: theme.primary, paddingX: 2, paddingY: 1, justifyContent: 'space-between' },
      React.createElement(Text, { bold: true, color: theme.primary }, ' 🖥️  Tmux 会话管理器 / Session Manager '),
      React.createElement(Text, { color: theme.muted }, `  ⏱️  ${configManager.get('refreshInterval')}秒 / s  `),
    ),
    
    // Filter summary
    React.createElement(Box, { borderStyle: 'single', borderColor: hasFilters ? theme.warning : theme.muted, paddingX: 2, paddingY: 0 },
      React.createElement(Text, { color: hasFilters ? theme.warning : theme.muted }, `  ${filterSummary}  `),
    ),
    
    // Session list header
    React.createElement(Box, { gap: 1, paddingLeft: 1, paddingRight: 1 },
      React.createElement(Text, { color: theme.muted, bold: true }, ' ID / Session ID'.padEnd(34)),
      React.createElement(Text, { color: theme.muted, bold: true }, ' 名称 / Name'.padEnd(12)),
      React.createElement(Text, { color: theme.muted, bold: true }, ' 分类 / Category'.padEnd(16)),
      React.createElement(Text, { color: theme.muted, bold: true }, ' 状态 / Status'.padEnd(16)),
      React.createElement(Text, { color: theme.muted, bold: true }, ' 活动时间 / Activity'),
    ),
    
    // Session list
    React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: theme.border, padding: 1 },
      filteredSessions.length === 0 ? 
        React.createElement(Box, { paddingX: 2, paddingY: 1 },
          React.createElement(Text, { color: theme.warning }, `  没有找到匹配的会话 / No matching sessions found。按 [f] 修改过滤器 / Press [f] to modify filter。  `),
        ) :
        filteredSessions.map((session, index) => {
          const categoryInfo = CATEGORY_CONFIG[session.category] || CATEGORY_CONFIG.task;
          const statusInfo = STATUS_CONFIG[session.status] || STATUS_CONFIG.running;
          const isSelected = index === selectedIndex;
          
          return React.createElement(Box, { 
            key: session.id, 
            gap: 1,
            backgroundColor: isSelected ? theme.bg : undefined,
          },
            React.createElement(Text, { 
              color: isSelected ? 'white' : theme.muted,
              bold: isSelected,
            }, truncateId(session.id).padEnd(34)),
            React.createElement(Text, { 
              color: isSelected ? 'white' : categoryInfo.color,
              bold: isSelected,
            }, session.name.padEnd(12)),
            React.createElement(Text, { 
              color: isSelected ? 'white' : categoryInfo.color,
              bold: isSelected,
            }, `${categoryInfo.icon} ${categoryInfo.label}`.padEnd(16)),
            React.createElement(Text, { 
              color: isSelected ? 'white' : statusInfo.color,
              bold: isSelected,
            }, `${statusInfo.icon} ${statusInfo.label}`.padEnd(16)),
            React.createElement(Text, { 
              color: isSelected ? 'white' : theme.muted,
              bold: isSelected,
            }, formatAge(session.lastActivityAt)),
          );
        })
    ),
    
    // Keyboard shortcuts
    React.createElement(Box, { borderStyle: 'single', borderColor: theme.muted, paddingX: 2, paddingY: 1, justifyContent: 'space-between' },
      React.createElement(Text, { color: theme.muted }, `  [↑↓] 选择 / Navigate  [r] 刷新 / Refresh  [n] 新建 / New  `),
      React.createElement(Text, { color: theme.muted }, `  [c] 捕获 / Capture  [s] 状态 / Status  [a] 连接 / Attach  `),
      React.createElement(Text, { color: theme.muted }, `  [k] 终止 / Kill  [f] 过滤 / Filter  [h?] 帮助 / Help  [q/Esc] 退出 / Exit  `),
    ),
  );
}

async function main() {
  const tmux = new TmuxManager();
  const { waitUntilExit } = render(React.createElement(App, { tmux }));
  await waitUntilExit();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});