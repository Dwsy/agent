import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Divider,
  FileButton,
  Flex,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ImagePlus, Send, Square, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import { useGatewayWs } from '../hooks/use-gateway-ws';
import { PageHeader } from '../components/atoms/page-header';
import { SurfaceCard } from '../components/atoms/surface-card';

type SessionItem = {
  sessionKey: string;
  role?: string;
  isStreaming?: boolean;
  messageCount?: number;
  lastActivity?: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'streaming' | 'error';
  text: string;
  images?: string[];
};

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };


type UploadImage = {
  data: string;
  mimeType: string;
  preview: string;
  name: string;
};

type MediaEventPayload = {
  sessionKey?: string;
  url?: string;
  type?: string;
  caption?: string;
  filename?: string;
};

type MessageEventPayload = {
  sessionKey?: string;
  text?: unknown;
  message?: unknown;
  content?: unknown;
};

type ExtensionUiOption = {
  value: string;
  label: string;
  hint?: string;
};

type ExtensionUiRequest = {
  id: string;
  method: 'select' | 'multiselect' | 'text' | 'editor' | 'confirm' | 'progress';
  title?: string;
  message?: string;
  options?: Array<ExtensionUiOption | string>;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string | boolean;
  initialValues?: string[];
  current?: number;
  total?: number;
  label?: string;
};

type HighlightClient = {
  getLanguage: (lang: string) => unknown;
  highlight: (code: string, options: { language: string }) => { value: string };
  highlightAuto: (code: string) => { value: string };
  registerLanguage: (name: string, language: (hljs: unknown) => unknown) => void;
};

let highlightClient: HighlightClient | null = null;
let highlightClientPromise: Promise<HighlightClient | null> | null = null;

marked.setOptions({
  breaks: true,
  gfm: true,
});

async function ensureHighlightClient(): Promise<HighlightClient | null> {
  if (highlightClient) return highlightClient;
  if (!highlightClientPromise) {
    highlightClientPromise = Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/yaml'),
      import('highlight.js/styles/github-dark.css'),
    ])
      .then(([
        core,
        javascript,
        typescript,
        json,
        bash,
        python,
        markdown,
        xml,
        yaml,
      ]) => {
        const hl = (core.default ?? core) as unknown as HighlightClient;
        hl.registerLanguage('javascript', (javascript.default ?? javascript) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('js', (javascript.default ?? javascript) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('typescript', (typescript.default ?? typescript) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('ts', (typescript.default ?? typescript) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('json', (json.default ?? json) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('bash', (bash.default ?? bash) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('sh', (bash.default ?? bash) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('python', (python.default ?? python) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('py', (python.default ?? python) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('markdown', (markdown.default ?? markdown) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('md', (markdown.default ?? markdown) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('xml', (xml.default ?? xml) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('html', (xml.default ?? xml) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('yaml', (yaml.default ?? yaml) as unknown as (hljs: unknown) => unknown);
        hl.registerLanguage('yml', (yaml.default ?? yaml) as unknown as (hljs: unknown) => unknown);
        highlightClient = hl;
        return highlightClient;
      })
      .catch(() => null);
  }
  return highlightClientPromise;
}

function normalizeSessions(list: SessionItem[]): SessionItem[] {
  return [...list].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function highlightHtmlCodeBlocks(html: string, highlighter: HighlightClient): string {
  return html.replace(/<pre><code(?: class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g, (_match, className, code) => {
    const cls = String(className ?? '');
    const langMatch = cls.match(/(?:language|lang)-([a-z0-9_+-]+)/i);
    const language = langMatch?.[1]?.toLowerCase();
    const decoded = decodeHtmlEntities(String(code));

    if (language && highlighter.getLanguage(language)) {
      const highlighted = highlighter.highlight(decoded, { language }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }

    const highlighted = highlighter.highlightAuto(decoded).value;
    return `<pre><code class="hljs">${highlighted}</code></pre>`;
  });
}

function containsRawHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function renderMarkdownHtml(text: string, highlighter: HighlightClient | null, parseThink = true): string {
  const source = parseThink ? renderThinkBlocks(text, highlighter) : text;
  const parsed = marked.parse(source, { async: false }) as string;
  if (!highlighter) return parsed;
  return highlightHtmlCodeBlocks(parsed, highlighter);
}

function renderThinkBlocks(text: string, highlighter: HighlightClient | null): string {
  return text.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, content) => {
    const inner = String(content ?? '').trim();
    if (!inner) return '';
    const innerHtml = renderMarkdownHtml(inner, highlighter, false);
    return `<details class="thinking-panel"><summary>💭 Thinking</summary><div class="thinking-content">${innerHtml}</div></details>`;
  });
}

function renderMessageHtml(text: string, highlighter: HighlightClient | null): string {
  const raw = String(text ?? '');
  if (!raw) return '';

  const withoutThinkTags = raw.replace(/<\/?think>/gi, '');
  if (containsRawHtml(withoutThinkTags)) {
    return renderThinkBlocks(raw, highlighter);
  }

  return renderMarkdownHtml(raw, highlighter);
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value as JsonLike, null, 2);
  } catch {
    return String(value);
  }
}

function looksLikeJsonObjectText(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function normalizeUnknownText(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (looksLikeJsonObjectText(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed) as JsonLike;
        return `\`\`\`json\n${prettyJson(parsed)}\n\`\`\``;
      } catch {
        return value;
      }
    }

    return value;
  }

  if (value === null || value === undefined) return '';

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return `\`\`\`json\n${prettyJson(value)}\n\`\`\``;
}

function normalizeExtensionOptions(options: Array<ExtensionUiOption | string> | undefined): ExtensionUiOption[] {
  if (!options?.length) return [];
  return options.map((option) => {
    if (typeof option === 'string') {
      return { value: option, label: option };
    }
    return {
      value: String(option.value),
      label: String(option.label ?? option.value),
      hint: option.hint,
    };
  });
}

function isLikelyImage(type?: string, filename?: string): boolean {
  if (type && ['photo', 'image'].includes(type.toLowerCase())) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(String(filename ?? ''));
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Invalid image payload'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read image failed'));
    reader.readAsDataURL(file);
  });
}

function formatSessionTitle(sessionKey: string) {
  const parts = sessionKey.split(':');
  if (parts.length >= 5) {
    const agent = parts[1] === 'main' ? '' : `${parts[1]} · `;
    const channel = parts[2];
    const id = parts.slice(4).join(':');
    return `${agent}${channel} · ${id.slice(0, 8)}`;
  }
  return sessionKey;
}

function formatLastActivity(ts?: number) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString();
}

export function ChatPage() {
  const { connected, request, on } = useGatewayWs();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sessionKeyRef = useRef('');

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionKey, setSessionKey] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<UploadImage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('');

  const [pendingUi, setPendingUi] = useState<ExtensionUiRequest | null>(null);
  const [uiTextValue, setUiTextValue] = useState('');
  const [uiMultiValues, setUiMultiValues] = useState<string[]>([]);

  const [highlightVersion, setHighlightVersion] = useState(0);

  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionKey === sessionKey) ?? null,
    [sessions, sessionKey],
  );

  const extensionOptions = useMemo(() => normalizeExtensionOptions(pendingUi?.options), [pendingUi]);

  const buildMessageHtml = useCallback(
    (text: string) => renderMessageHtml(text, highlightClient),
    [highlightVersion],
  );

  const shouldAcceptSessionEvent = useCallback((incomingSessionKey?: string) => {
    const active = sessionKeyRef.current;
    if (!incomingSessionKey) return true;
    if (!active) return true;
    return incomingSessionKey === active;
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await request<SessionItem[]>('sessions.list');
      setSessions(normalizeSessions(list ?? []));
    } catch (error) {
      notifications.show({
        color: 'red',
        title: '加载会话失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [request]);

  const refreshRoles = useCallback(async () => {
    try {
      const payload = await request<{ roles: string[] }>('session.listRoles');
      setRoles(payload?.roles ?? []);
    } catch {
      // ignore
    }
  }, [request]);

  const appendAssistantText = useCallback((text: unknown) => {
    const normalized = normalizeUnknownText(text);
    const trimmed = normalized.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && (last.role === 'assistant' || last.role === 'streaming')) {
        const glue = last.text.trim().length ? '\n' : '';
        last.role = 'assistant';
        last.text = `${last.text}${glue}${trimmed}`;
        return copy;
      }
      return [...copy, { id: crypto.randomUUID(), role: 'assistant', text: trimmed }];
    });
  }, []);

  const appendAssistantImages = useCallback((urls: string[]) => {
    const incoming = urls.filter(Boolean);
    if (!incoming.length) return;

    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && (last.role === 'assistant' || last.role === 'streaming')) {
        last.role = 'assistant';
        const existing = last.images ?? [];
        const deduped = [...existing, ...incoming].filter((url, idx, arr) => arr.indexOf(url) === idx);
        last.images = deduped;
        return copy;
      }

      return [
        ...copy,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: '',
          images: incoming,
        },
      ];
    });
  }, []);

  const appendAssistantFile = useCallback((filename: string, url: string, caption?: string) => {
    const safeName = caption || filename || 'Download file';
    appendAssistantText(`[📎 ${safeName}](${url})`);
  }, [appendAssistantText]);

  const resetPendingUi = useCallback(() => {
    setPendingUi(null);
    setUiTextValue('');
    setUiMultiValues([]);
  }, []);

  const respondExtensionUi = useCallback(async (payload: { value?: string | string[]; confirmed?: boolean; cancelled?: boolean }) => {
    if (!pendingUi) return;

    try {
      await request('extension_ui_response', {
        id: pendingUi.id,
        ...payload,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: '扩展交互响应失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      resetPendingUi();
    }
  }, [pendingUi, request, resetPendingUi]);

  useEffect(() => {
    if (!connected) return;

    void refreshSessions();
    void refreshRoles();

    const offReply = on<{ text?: unknown; message?: unknown; content?: unknown; images?: string[] }>('chat.reply', (payload) => {
      setIsTyping(false);
      setIsStreaming(false);

      const replyText = normalizeUnknownText(payload?.text ?? payload?.message ?? payload?.content);

      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'streaming') {
          last.role = 'assistant';
          if (replyText) last.text = replyText;
          if (payload?.images?.length) {
            last.images = [...(last.images ?? []), ...payload.images]
              .filter((url, idx, arr) => arr.indexOf(url) === idx);
          }
          return copy;
        }

        const hasContent = replyText.trim().length > 0 || Boolean(payload?.images?.length);
        if (!hasContent) return copy;

        return [
          ...copy,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: replyText,
            images: payload?.images,
          },
        ];
      });
      void refreshSessions();
    });

    const offTyping = on<{ typing?: boolean }>('chat.typing', (payload) => {
      setIsTyping(Boolean(payload?.typing));
    });

    const offAgent = on<any>('agent', (payload) => {
      if (payload?.type !== 'message_update') return;
      const event = payload?.assistantMessageEvent ?? payload?.assistant_message_event;
      if (!event) return;

      if (event.type === 'text_delta' && event.delta) {
        setIsStreaming(true);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'streaming') {
            last.text += event.delta;
            return copy;
          }
          return [...copy, { id: crypto.randomUUID(), role: 'streaming', text: event.delta }];
        });
      }
    });

    const offAgentEnd = on<any>('agent', (payload) => {
      if (payload?.type !== 'agent_end') return;
      setIsStreaming(false);
      setIsTyping(false);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'streaming') {
          last.role = 'assistant';
        }
        return copy;
      });
      void refreshSessions();
    });

    const offMediaEvent = on<MediaEventPayload>('media_event', (payload) => {
      if (!shouldAcceptSessionEvent(payload?.sessionKey)) return;
      if (!payload?.url) return;

      if (isLikelyImage(payload.type, payload.filename)) {
        appendAssistantImages([payload.url]);
      } else {
        appendAssistantFile(payload.filename ?? 'Download', payload.url, payload.caption);
      }
      setIsTyping(false);
      setIsStreaming(false);
      void refreshSessions();
    });

    const offMessageEvent = on<MessageEventPayload>('message_event', (payload) => {
      if (!shouldAcceptSessionEvent(payload?.sessionKey)) return;

      const eventText = payload?.text ?? payload?.message ?? payload?.content;
      const normalized = normalizeUnknownText(eventText);
      if (!normalized.trim()) return;

      appendAssistantText(eventText);
      setIsTyping(false);
      setIsStreaming(false);
      void refreshSessions();
    });

    const offExtensionUiRequest = on<ExtensionUiRequest>('extension_ui_request', (payload) => {
      setPendingUi(payload);
      setUiTextValue(payload.defaultValue ?? '');
      setUiMultiValues(Array.isArray(payload.initialValues) ? payload.initialValues : []);
    });

    const offExtensionUiDismissed = on<{ id?: string }>('extension_ui_dismissed', (payload) => {
      if (!payload?.id) return;
      if (pendingUi?.id && payload.id === pendingUi.id) {
        resetPendingUi();
      }
    });

    return () => {
      offReply();
      offTyping();
      offAgent();
      offAgentEnd();
      offMediaEvent();
      offMessageEvent();
      offExtensionUiRequest();
      offExtensionUiDismissed();
    };
  }, [
    appendAssistantFile,
    appendAssistantImages,
    appendAssistantText,
    connected,
    on,
    pendingUi?.id,
    refreshRoles,
    refreshSessions,
    resetPendingUi,
    shouldAcceptSessionEvent,
  ]);

  useEffect(() => {
    if (!messages.length || highlightClient) return;
    const shouldLoad = messages.some((message) => /```|<pre><code/i.test(message.text));
    if (!shouldLoad) return;

    let cancelled = false;
    void ensureHighlightClient().then((loaded) => {
      if (!cancelled && loaded) {
        setHighlightVersion((v) => v + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isTyping, pendingUi]);

  const handleSelectSession = async (key: string) => {
    setSessionKey(key);
    sessionKeyRef.current = key;
    setMessages([]);
    try {
      const result = await request<{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }>('chat.history', {
        sessionKey: key,
      });
      setMessages(
        (result?.messages ?? []).map((message) => ({
          id: crypto.randomUUID(),
          role: message.role,
          text: normalizeUnknownText(message.content),
        })),
      );

      const state = await request<{ role?: string }>('sessions.get', { sessionKey: key });
      setCurrentRole(state?.role ?? '');
    } catch (error) {
      notifications.show({
        color: 'red',
        title: '加载历史失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleNewSession = () => {
    const newSession = `agent:main:webchat:dm:${Date.now().toString(36)}`;
    setSessionKey(newSession);
    sessionKeyRef.current = newSession;
    setMessages([]);
    setCurrentRole('');
    resetPendingUi();
    void refreshSessions();
  };

  const handleDeleteSession = async (key: string) => {
    try {
      await request('sessions.delete', { sessionKey: key });
      setSessions((prev) => prev.filter((item) => item.sessionKey !== key));
      if (sessionKeyRef.current === key) {
        setSessionKey('');
        sessionKeyRef.current = '';
        setMessages([]);
      }
      await refreshSessions();
    } catch (error) {
      notifications.show({
        color: 'red',
        title: '删除会话失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleRoleChange = async (role: string | null) => {
    if (!role || !sessionKey) return;
    try {
      await request('session.setRole', { sessionKey, role });
      setCurrentRole(role);
      void refreshSessions();
    } catch (error) {
      notifications.show({
        color: 'red',
        title: '切换角色失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleImageSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifications.show({ color: 'yellow', title: '仅支持图片', message: file.name });
      return;
    }
    try {
      const data = await toBase64(file);
      setPendingImages((prev) => [
        ...prev,
        {
          data,
          mimeType: file.type,
          preview: URL.createObjectURL(file),
          name: file.name,
        },
      ]);
    } catch {
      notifications.show({ color: 'red', title: '图片读取失败', message: file.name });
    }
  };

  const handleAbort = async () => {
    try {
      await request('chat.abort', { sessionKey: sessionKey || undefined });
      setIsStreaming(false);
      setIsTyping(false);
    } catch {
      // ignore
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && pendingImages.length === 0) return;

    const payloadText = text || 'Describe this image.';
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: payloadText,
        images: pendingImages.map((image) => image.preview),
      },
    ]);
    setInput('');

    const images = pendingImages.map((image) => ({ data: image.data, mimeType: image.mimeType }));
    setPendingImages([]);

    try {
      await request('chat.send', {
        text: payloadText,
        sessionKey: sessionKey || undefined,
        images: images.length ? images : undefined,
      });
      await refreshSessions();
      setTimeout(() => {
        void refreshSessions();
      }, 400);
    } catch (error) {
      setIsStreaming(false);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'error',
          text: error instanceof Error ? error.message : '发送失败',
        },
      ]);
    }
  };

  const renderExtensionUiPrompt = () => {
    if (!pendingUi) return null;

    if (pendingUi.method === 'progress') {
      const progressPct = pendingUi.total
        ? Math.min(100, Math.max(0, Math.round(((pendingUi.current ?? 0) / pendingUi.total) * 100)))
        : undefined;

      return (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600}>{pendingUi.label || pendingUi.title || 'Agent progress'}</Text>
            {progressPct !== undefined ? (
              <>
                <Progress value={progressPct} />
                <Text size="xs" c="dimmed">{pendingUi.current ?? 0} / {pendingUi.total}</Text>
              </>
            ) : (
              <Text size="sm" c="dimmed">Processing...</Text>
            )}
          </Stack>
        </Paper>
      );
    }

    return (
      <Paper withBorder p="sm" bg="yellow.0">
        <Stack gap="xs">
          <Text fw={600}>{pendingUi.title || 'Agent request'}</Text>
          {pendingUi.message ? <Text size="sm">{pendingUi.message}</Text> : null}

          {pendingUi.method === 'select' ? (
            <Stack gap={6}>
              {extensionOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="light"
                  justify="flex-start"
                  onClick={() => void respondExtensionUi({ value: option.value })}
                >
                  <Stack gap={0} align="flex-start">
                    <Text size="sm">{option.label}</Text>
                    {option.hint ? <Text size="xs" c="dimmed">{option.hint}</Text> : null}
                  </Stack>
                </Button>
              ))}
              <Group justify="flex-end">
                <Button size="xs" variant="subtle" color="gray" onClick={() => void respondExtensionUi({ cancelled: true })}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          ) : null}

          {pendingUi.method === 'multiselect' ? (
            <Stack gap="xs">
              {extensionOptions.map((option) => (
                <Checkbox
                  key={option.value}
                  label={option.label}
                  description={option.hint}
                  checked={uiMultiValues.includes(option.value)}
                  onChange={(event) => {
                    setUiMultiValues((prev) => {
                      if (event.currentTarget.checked) {
                        return [...prev, option.value].filter((v, idx, arr) => arr.indexOf(v) === idx);
                      }
                      return prev.filter((value) => value !== option.value);
                    });
                  }}
                />
              ))}
              <Group justify="flex-end">
                <Button size="xs" variant="subtle" color="gray" onClick={() => void respondExtensionUi({ cancelled: true })}>
                  Cancel
                </Button>
                <Button size="xs" onClick={() => void respondExtensionUi({ value: uiMultiValues })}>
                  Submit
                </Button>
              </Group>
            </Stack>
          ) : null}

          {(pendingUi.method === 'text' || pendingUi.method === 'editor') ? (
            <Stack gap="xs">
              <Textarea
                autosize
                minRows={pendingUi.method === 'editor' ? 6 : 3}
                maxRows={12}
                placeholder={pendingUi.placeholder || 'Enter response'}
                value={uiTextValue}
                onChange={(event) => setUiTextValue(event.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button size="xs" variant="subtle" color="gray" onClick={() => void respondExtensionUi({ cancelled: true })}>
                  Cancel
                </Button>
                <Button size="xs" onClick={() => void respondExtensionUi({ value: uiTextValue })}>
                  Submit
                </Button>
              </Group>
            </Stack>
          ) : null}

          {pendingUi.method === 'confirm' ? (
            <Group justify="flex-end">
              <Button size="xs" variant="subtle" color="gray" onClick={() => void respondExtensionUi({ confirmed: false, value: 'false' })}>
                No
              </Button>
              <Button size="xs" onClick={() => void respondExtensionUi({ confirmed: true, value: 'true' })}>
                Yes
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Paper>
    );
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Unified Chat"
        description="Merged web chat inside modern admin console (Mantine)"
        action={<Badge color={connected ? 'green' : 'red'}>{connected ? 'WS Online' : 'WS Offline'}</Badge>}
      />

      <Flex gap="md" align="stretch" wrap="nowrap">
        <SurfaceCard style={{ width: 320, minWidth: 320 }}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>Sessions</Title>
              <Button size="xs" onClick={handleNewSession}>New</Button>
            </Group>

            <ScrollArea h={560}>
              <Stack gap={6}>
                {sessions.map((session) => (
                  <Paper
                    key={session.sessionKey}
                    p="xs"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      borderColor: session.sessionKey === sessionKey ? 'var(--mantine-color-blue-5)' : undefined,
                    }}
                    onClick={() => handleSelectSession(session.sessionKey)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {formatSessionTitle(session.sessionKey)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {session.messageCount ?? 0} msgs · {formatLastActivity(session.lastActivity)}
                        </Text>
                      </Box>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteSession(session.sessionKey);
                        }}
                      >
                        <Trash2 size={14} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </SurfaceCard>

        <SurfaceCard style={{ flex: 1, minWidth: 0 }}>
          <Stack gap="sm" h="100%">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={600}>{activeSession ? formatSessionTitle(activeSession.sessionKey) : 'New Chat'}</Text>
                {sessionKey ? (
                  <Code>{sessionKey}</Code>
                ) : (
                  <Text size="xs" c="dimmed">No active session</Text>
                )}
              </Stack>

              <Group>
                <Select
                  placeholder="Role"
                  data={roles.map((role) => ({ value: role, label: role }))}
                  value={currentRole || null}
                  onChange={handleRoleChange}
                  w={180}
                  disabled={!sessionKey || !roles.length}
                />
                {isStreaming ? (
                  <Button color="red" leftSection={<Square size={14} />} onClick={handleAbort}>
                    Stop
                  </Button>
                ) : null}
              </Group>
            </Group>

            <Divider />

            <ScrollArea h={460} viewportRef={viewportRef}>
              <Stack gap="sm" pr="xs">
                {messages.map((message) => (
                  <Paper
                    key={message.id}
                    p="sm"
                    withBorder
                    bg={message.role === 'user' ? 'blue.0' : undefined}
                  >
                    <Text size="xs" c="dimmed" mb={4}>
                      {message.role}
                    </Text>

                    {message.images?.length ? (
                      <Group gap="xs" mb="xs" wrap="wrap">
                        {message.images.map((src, index) => (
                          <img
                            key={`${message.id}-${index}`}
                            src={src}
                            alt={`image-${index}`}
                            style={{ width: 120, height: 90, borderRadius: 8, objectFit: 'cover' }}
                          />
                        ))}
                      </Group>
                    ) : null}

                    <Box
                      className="chat-message-body"
                      style={{ fontSize: 14 }}
                      dangerouslySetInnerHTML={{ __html: buildMessageHtml(message.text) }}
                    />
                  </Paper>
                ))}

                {isTyping ? (
                  <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">typing...</Text>
                  </Group>
                ) : null}
              </Stack>
            </ScrollArea>

            {renderExtensionUiPrompt()}

            <Divider />

            <Stack gap="xs">
              {pendingImages.length ? (
                <Group gap="xs" wrap="wrap">
                  {pendingImages.map((image, index) => (
                    <Paper key={`${image.name}-${index}`} p={4} withBorder>
                      <Stack gap={4}>
                        <img
                          src={image.preview}
                          alt={image.name}
                          style={{ width: 96, height: 72, borderRadius: 6, objectFit: 'cover' }}
                        />
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() => {
                            setPendingImages((prev) => prev.filter((_, i) => i !== index));
                          }}
                        >
                          remove
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                </Group>
              ) : null}

              <Group align="flex-end" wrap="nowrap">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.currentTarget.value)}
                  placeholder="Type message..."
                  autosize
                  minRows={2}
                  maxRows={6}
                  style={{ flex: 1 }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />

                <FileButton onChange={handleImageSelect} accept="image/*">
                  {(props) => (
                    <ActionIcon size="lg" variant="default" {...props}>
                      <ImagePlus size={16} />
                    </ActionIcon>
                  )}
                </FileButton>

                <ActionIcon size="lg" onClick={() => void handleSend()} disabled={isStreaming}>
                  <Send size={16} />
                </ActionIcon>
              </Group>
            </Stack>
          </Stack>
        </SurfaceCard>
      </Flex>
    </Stack>
  );
}
