import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  FileButton,
  Flex,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ImagePlus, Send, Square, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import hljs from 'highlight.js';
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

type UploadImage = {
  data: string;
  mimeType: string;
  preview: string;
  name: string;
};

marked.setOptions({
  breaks: true,
  gfm: true,
});

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

function renderMarkdown(text: string) {
  const html = marked.parse(text, { async: false });
  return html.replace(/<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g, (_match, lang, code) => {
    const decoded = code
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    if (lang && hljs.getLanguage(lang)) {
      return `<pre><code class="hljs language-${lang}">${hljs.highlight(decoded, { language: lang }).value}</code></pre>`;
    }
    return `<pre><code class="hljs">${hljs.highlightAuto(decoded).value}</code></pre>`;
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

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionKey, setSessionKey] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<UploadImage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('');

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionKey === sessionKey) ?? null,
    [sessions, sessionKey],
  );

  useEffect(() => {
    if (!connected) return;

    const loadSessions = async () => {
      try {
        const list = await request<SessionItem[]>('sessions.list');
        setSessions((list ?? []).sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)));
      } catch (error) {
        notifications.show({
          color: 'red',
          title: '加载会话失败',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    const loadRoles = async () => {
      try {
        const payload = await request<{ roles: string[] }>('session.listRoles');
        setRoles(payload?.roles ?? []);
      } catch {
        // ignore
      }
    };

    loadSessions();
    loadRoles();

    const offReply = on<{ text?: string; images?: string[] }>('chat.reply', (payload) => {
      setIsTyping(false);
      setIsStreaming(false);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'streaming') {
          last.role = 'assistant';
          if (payload?.text) last.text = payload.text;
          if (payload?.images?.length) last.images = payload.images;
          return copy;
        }
        return [
          ...copy,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: payload?.text ?? '',
            images: payload?.images,
          },
        ];
      });
    });

    const offTyping = on<{ typing?: boolean }>('chat.typing', (payload) => {
      setIsTyping(Boolean(payload?.typing));
    });

    const offAgent = on<any>('agent', (payload) => {
      if (payload?.type !== 'message_update') return;
      const event = payload?.assistantMessageEvent;
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
    });

    return () => {
      offReply();
      offTyping();
      offAgent();
      offAgentEnd();
    };
  }, [connected, request, on]);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSelectSession = async (key: string) => {
    setSessionKey(key);
    setMessages([]);
    try {
      const result = await request<{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }>('chat.history', {
        sessionKey: key,
      });
      setMessages(
        (result?.messages ?? []).map((message) => ({
          id: crypto.randomUUID(),
          role: message.role,
          text: message.content,
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
    setMessages([]);
    setCurrentRole('');
  };

  const handleDeleteSession = async (key: string) => {
    try {
      await request('sessions.delete', { sessionKey: key });
      setSessions((prev) => prev.filter((item) => item.sessionKey !== key));
      if (sessionKey === key) {
        setSessionKey('');
        setMessages([]);
      }
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
                          handleDeleteSession(session.sessionKey);
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
                      style={{ fontSize: 14 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
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
