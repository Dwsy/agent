#!/usr/bin/env bun
import { render } from 'ink';
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Newline, useInput, useApp, useStdin } from 'ink';
import { TmuxManager } from './lib.ts';
import type { TmuxSession, SessionStatus } from './types/index.js';

interface AppProps {
  tmux: TmuxManager;
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: 'green',
  idle: 'yellow',
  exited: 'red',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  running: '运行中/Running',
  idle: '空闲/Idle',
  exited: '已退出/Exited',
};

const CATEGORY_COLORS: Record<string, string> = {
  task: 'cyan',
  service: 'magenta',
  agent: 'blue',
};

const CATEGORY_LABELS: Record<string, string> = {
  task: '任务/Task',
  service: '服务/Service',
  agent: '代理/Agent',
};

function App({ tmux }: AppProps) {
  const { exit } = useApp();
  const { stdin, setRawMode } = useStdin();
  
  useEffect(() => {
    if (stdin && stdin.isTTY) {
      setRawMode(true);
      return () => setRawMode(false);
    }
  }, [stdin, setRawMode]);

  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'create' | 'capture' | 'status' | 'attach' | 'confirm'>('list');
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
    const interval = setInterval(refreshSessions, 5000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  useInput((input, key) => {
    if (mode === 'list') {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1));
      } else if (input === 'r') {
        refreshSessions();
      } else if (input === 'q' || key.escape) {
        exit();
      } else if (input === 'k' && sessions.length > 0) {
        setMode('confirm');
      } else if (input === 'c' && sessions.length > 0) {
        handleCapture();
      } else if (input === 's' && sessions.length > 0) {
        handleStatus();
      } else if (input === 'a' && sessions.length > 0) {
        handleAttach();
      } else if (input === 'n') {
        setMode('create');
        setNameInput('');
        setCommandInput('');
        setCategoryInput('task');
        setInputStep('name');
      }
    } else if (mode === 'confirm') {
      if (input === 'y') {
        handleKill();
      } else if (input === 'n' || key.escape) {
        setMode('list');
      }
    } else if (mode === 'create') {
      if (key.return) {
        if (inputStep === 'name' && nameInput) {
          setInputStep('command');
        } else if (inputStep === 'command' && commandInput) {
          setInputStep('category');
        } else if (inputStep === 'category') {
          handleCreate();
        }
      } else if (key.escape) {
        setMode('list');
      } else if (key.backspace || key.delete) {
        if (inputStep === 'name') {
          setNameInput(prev => prev.slice(0, -1));
        } else if (inputStep === 'command') {
          setCommandInput(prev => prev.slice(0, -1));
        } else if (inputStep === 'category') {
          setCategoryInput(prev => prev.slice(0, -1));
        }
      } else if (input.length === 1) {
        if (inputStep === 'name') {
          setNameInput(prev => prev + input);
        } else if (inputStep === 'command') {
          setCommandInput(prev => prev + input);
        } else if (inputStep === 'category') {
          setCategoryInput(prev => prev + input);
        }
      }
    } else if (mode === 'capture' || mode === 'status' || mode === 'attach') {
      if (key.escape) {
        setMode('list');
        setOutput('');
      }
    }
  });

  const handleKill = async () => {
    if (sessions[selectedIndex]) {
      await tmux.killSession(sessions[selectedIndex].id);
      await refreshSessions();
      setMode('list');
    }
  };

  const handleCapture = async () => {
    if (sessions[selectedIndex]) {
      const result = await tmux.capturePane(sessions[selectedIndex].target, 200);
      setOutput(result);
      setMode('capture');
    }
  };

  const handleStatus = async () => {
    if (sessions[selectedIndex]) {
      const session = sessions[selectedIndex];
      const status = await tmux.getSessionStatus(session.target);
      setOutput(
        `ID/会话ID: ${session.id}\n` +
        `名称/Name: ${session.name}\n` +
        `分类/Category: ${session.category}\n` +
        `状态/Status: ${status}\n` +
        `创建时间/Created: ${session.createdAt}\n` +
        `最后活动/Last Activity: ${session.lastActivityAt}\n` +
        `命令/Command: ${session.command}`
      );
      setMode('status');
    }
  };

  const handleAttach = async () => {
    if (sessions[selectedIndex]) {
      const session = sessions[selectedIndex];
      setOutput(
        `要连接到此会话，请运行/To attach to this session, run:\n\n` +
        `  tmux -S ${session.socket} attach -t ${session.id}\n\n` +
        `断开连接/Detach with: Ctrl+b d`
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
    return age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;
  };

  if (mode === 'create') {
    const inputLabel = inputStep === 'name' ? '名称/Name' : inputStep === 'command' ? '命令/Command' : '分类/Category';
    const inputValue = inputStep === 'name' ? nameInput : inputStep === 'command' ? commandInput : categoryInput;
    const placeholder = inputStep === 'category' ? '(任务/任务/服务/代理/Task/Service/Agent)' : '';

    return React.createElement(Box, { flexDirection: 'column', padding: 1, key: 'create-mode' },
      React.createElement(Text, { bold: true, color: 'green', key: 'title' }, '创建新会话/Create New Session'),
      React.createElement(Text, { key: 'newline-1' }, '\n'),
      React.createElement(Box, { key: 'name-row' },
        React.createElement(Text, { color: inputStep === 'name' ? 'cyan' : 'gray' }, '名称/Name: '),
        React.createElement(Text, { color: inputStep === 'name' ? 'white' : 'dim' }, nameInput)
      ),
      React.createElement(Box, { key: 'command-row' },
        React.createElement(Text, { color: inputStep === 'command' ? 'cyan' : 'gray' }, '命令/Command: '),
        React.createElement(Text, { color: inputStep === 'command' ? 'white' : 'dim' }, commandInput)
      ),
      React.createElement(Box, { key: 'category-row' },
        React.createElement(Text, { color: inputStep === 'category' ? 'cyan' : 'gray' }, '分类/Category: '),
        React.createElement(Text, { color: inputStep === 'category' ? 'white' : 'dim' }, categoryInput),
        React.createElement(Text, { color: 'gray' }, ' ' + placeholder)
      ),
      React.createElement(Text, { key: 'newline-2' }, '\n'),
      React.createElement(Text, { color: 'gray', key: 'hint' }, '按 Enter 继续/Press Enter to continue，按 Esc 取消/Press Esc to cancel'),
      React.createElement(Text, { key: 'newline-3' }, '\n'),
      React.createElement(Box, { key: 'input-row' },
        React.createElement(Text, { color: 'magenta' }, '> '),
        React.createElement(Text, { color: 'white' }, inputValue),
        React.createElement(Text, { color: 'white', inverse: true }, ' ')
      )
    );
  }

  if (mode === 'confirm') {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true, color: 'red' }, '确认终止/Confirm Kill'),
      React.createElement(Text, { key: 'newline-1' }, '\n'),
      React.createElement(Text, null, '确定要终止以下会话吗？/Are you sure you want to kill session:'),
      React.createElement(Text, { color: 'yellow' }, '  ' + (sessions[selectedIndex]?.id || '')),
      React.createElement(Text, { key: 'newline-2' }, '\n'),
      React.createElement(Text, { color: 'cyan' }, '[Y]是/Yes  [N]否/No')
    );
  }

  if (mode === 'capture') {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true, color: 'green' }, '捕获输出/Capture Output'),
      React.createElement(Text, { key: 'newline-1' }, '\n'),
      React.createElement(Text, { color: 'yellow' }, sessions[selectedIndex]?.id || ''),
      React.createElement(Text, { key: 'newline-2' }, '\n'),
      React.createElement(Box, { flexDirection: 'column' },
        output.split('\n').map((line, i) => 
          React.createElement(Text, { key: i, dimColor: i > 100 }, line)
        )
      ),
      React.createElement(Text, { key: 'newline-3' }, '\n'),
      React.createElement(Text, { color: 'gray' }, '按 Esc 返回/Press Esc to return')
    );
  }

  if (mode === 'status') {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true, color: 'green' }, '会话状态/Session Status'),
      React.createElement(Text, { key: 'newline-1' }, '\n'),
      output.split('\n').map((line, i) => 
        React.createElement(Text, { key: i }, line)
      ),
      React.createElement(Text, { key: 'newline-2' }, '\n'),
      React.createElement(Text, { color: 'gray' }, '按 Esc 返回/Press Esc to return')
    );
  }

  if (mode === 'attach') {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true, color: 'green' }, '连接命令/Attach Command'),
      React.createElement(Text, { key: 'newline-1' }, '\n'),
      React.createElement(Text, { color: 'yellow' }, sessions[selectedIndex]?.id || ''),
      React.createElement(Text, { key: 'newline-2' }, '\n'),
      output.split('\n').map((line, i) => 
        React.createElement(Text, { key: i }, line)
      ),
      React.createElement(Text, { key: 'newline-3' }, '\n'),
      React.createElement(Text, { color: 'gray' }, '按 Esc 返回/Press Esc to return')
    );
  }

  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    React.createElement(Box, { justifyContent: 'space-between' },
      React.createElement(Text, { bold: true, color: 'green' }, 'Tmux 会话管理器/Session Manager'),
      React.createElement(Text, { color: 'gray' }, '自动刷新/Auto-refresh: 5秒/s')
    ),
    React.createElement(Text, { key: 'newline-1' }, '\n'),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'gray' }, '会话ID/Session ID               '),
      React.createElement(Text, { color: 'gray' }, '名称/Name  '),
      React.createElement(Text, { color: 'gray' }, '分类/Category '),
      React.createElement(Text, { color: 'gray' }, '状态/Status  '),
      React.createElement(Text, { color: 'gray' }, '最后活动/Last Activity')
    ),
    React.createElement(Text, { color: 'gray' }, '───────────────────────────────────────────────────────────────────────────────────'),
    sessions.length === 0 ? 
      React.createElement(Text, { color: 'yellow' }, '没有找到会话/No sessions found。按 [n] 创建新会话/Press [n] to create a new session。') :
      sessions.map((session, index) => 
        React.createElement(Box, { key: session.id },
          React.createElement(Text, { 
            backgroundColor: index === selectedIndex ? 'blue' : undefined,
            color: 'white'
          }, session.id.padEnd(33)),
          React.createElement(Text, { 
            backgroundColor: index === selectedIndex ? 'blue' : undefined,
            color: index === selectedIndex ? 'white' : CATEGORY_COLORS[session.category] || 'white'
          }, session.name.padEnd(11)),
          React.createElement(Text, { 
            backgroundColor: index === selectedIndex ? 'blue' : undefined,
            color: index === selectedIndex ? 'white' : CATEGORY_COLORS[session.category] || 'white'
          }, CATEGORY_LABELS[session.category] || session.category),
          React.createElement(Text, { 
            backgroundColor: index === selectedIndex ? 'blue' : undefined,
            color: index === selectedIndex ? 'white' : STATUS_COLORS[session.status]
          }, STATUS_LABELS[session.status]),
          React.createElement(Text, { 
            backgroundColor: index === selectedIndex ? 'blue' : undefined,
            color: index === selectedIndex ? 'white' : 'gray'
          }, formatAge(session.lastActivityAt))
        )
      ),
    React.createElement(Text, { key: 'newline-2' }, '\n'),
    React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { color: 'cyan' }, '键盘快捷键/Keyboard Shortcuts:'),
      React.createElement(Text, { color: 'gray' }, '  [↑/↓] 导航/Navigate     [r] 刷新/Refresh   [n] 新建/New'),
      React.createElement(Text, { color: 'gray' }, '  [c] 捕获/Capture       [s] 状态/Status     [a] 连接/Attach'),
      React.createElement(Text, { color: 'gray' }, '  [k] 终止/Kill          [q/Esc] 退出/Quit')
    )
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