import type {
  PsmFsClient,
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmSessionReference,
  PsmSessionUiRenderProps,
} from '@pi-session-manager/plugin-sdk'
import { hostReact } from './host-react'

const React = hostReact()
const { Component, createElement } = React

const ROOT_ID = 'system-prompts'
const PANEL_ID = 'local.system-prompt-history.panel'
const TOOLBAR_ID = 'local.system-prompt-history.toolbar'

interface RevisionRef {
  version: number
  id: string
  at: string
}

interface SessionRef {
  schema: 1
  sessionId: string
  projectKey: string
  projectRoot?: string
  revisions: RevisionRef[]
}

interface GlobalSessionRef {
  schema: 1
  sessionId: string
  projectKey: string
  projectRoot?: string
  sessionPath: string
  sessionFile?: string
  updatedAt?: string
}

interface ChunkRef {
  hash: string
  bytes: number
}

interface RevisionManifest {
  schema: 1
  id: string
  promptHash: string
  chunks: ChunkRef[]
  chars: number
  bytes: number
  lines: number
  createdAt: string
}

interface LoadedRevision {
  ref: RevisionRef
  manifest: RevisionManifest
  prompt: string
}

interface HistoryData {
  projectKey: string
  projectRoot?: string
  session: SessionRef
}

interface PanelProps {
  fs: PsmFsClient
  session: PsmSessionReference
  open: boolean
  onClose: () => void
}

interface PanelState {
  loading: boolean
  error: string | null
  history: HistoryData | null
  selectedId: string | null
  loaded: LoadedRevision | null
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'local.system-prompt-history',
  name: 'System Prompt History',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['system-prompts:read'],
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function shortHash(value: string): string {
  return value.slice(0, 10)
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function readJson<T>(fs: PsmFsClient, path: string, maxBytes = 256 * 1024): Promise<T> {
  const result = await fs.read(ROOT_ID, path, { maxBytes })
  return JSON.parse(result.content) as T
}

async function findHistory(fs: PsmFsClient, sessionId: string): Promise<HistoryData | null> {
  try {
    const globalRef = await readJson<GlobalSessionRef>(fs, `sessions/${sessionId}.json`, 64 * 1024)
    const session = await readJson<SessionRef>(fs, globalRef.sessionPath, 512 * 1024)
    return { projectKey: globalRef.projectKey, projectRoot: globalRef.projectRoot, session }
  } catch {
    // History captured before the global session index existed: scan project refs once.
  }

  const projects = await fs.list(ROOT_ID, 'projects').catch(() => [])
  for (const project of projects) {
    if (project.kind !== 'directory') continue
    const path = `projects/${project.name}/sessions/${sessionId}.json`
    const stat = await fs.stat(ROOT_ID, path)
    if (!stat) continue
    const session = await readJson<SessionRef>(fs, path, 512 * 1024)
    return { projectKey: session.projectKey || project.name, projectRoot: session.projectRoot, session }
  }
  return null
}

async function loadRevision(fs: PsmFsClient, projectKey: string, ref: RevisionRef): Promise<LoadedRevision> {
  const manifest = await readJson<RevisionManifest>(fs, `projects/${projectKey}/revisions/${ref.id}.json`, 512 * 1024)
  const chunks = await Promise.all(manifest.chunks.map(async ({ hash }) => {
    const result = await fs.read(ROOT_ID, `objects/sha256/${hash.slice(0, 2)}/${hash.slice(2)}`, { maxBytes: 64 * 1024 })
    return result.content
  }))
  return { ref, manifest, prompt: chunks.join('') }
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function ToolbarButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      title="System Prompt History"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${open ? 'border-info/45 bg-info/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
    >
      <HistoryIcon />
      <span>System Prompt</span>
    </button>
  )
}

class PromptHistoryPanel extends Component<PanelProps, PanelState> {
  private loadToken = 0

  state: PanelState = {
    loading: false,
    error: null,
    history: null,
    selectedId: null,
    loaded: null,
  }

  componentDidMount() {
    if (this.props.open) void this.refresh()
  }

  componentDidUpdate(prevProps: PanelProps) {
    const changedSession = prevProps.session.id !== this.props.session.id || prevProps.session.path !== this.props.session.path
    if ((this.props.open && !prevProps.open) || (this.props.open && changedSession)) void this.refresh()
  }

  private refresh = async () => {
    const token = ++this.loadToken
    const sessionId = this.props.session.id
    if (!sessionId) {
      this.setState({ loading: false, error: 'This session has no stable Pi session id.', history: null, selectedId: null, loaded: null })
      return
    }

    this.setState({ loading: true, error: null })
    try {
      const roots = await this.props.fs.roots()
      if (!roots.some((root) => root.id === ROOT_ID && root.read)) {
        throw new Error('PSM host does not expose the system-prompts filesystem root. Restart PSM after rebuilding the host change.')
      }

      const history = await findHistory(this.props.fs, sessionId)
      if (token !== this.loadToken) return
      if (!history) {
        this.setState({ loading: false, error: null, history: null, selectedId: null, loaded: null })
        return
      }

      const latest = history.session.revisions.at(-1) ?? null
      this.setState({ history, selectedId: latest?.id ?? null, loaded: null, loading: Boolean(latest) })
      if (latest) await this.selectRevision(latest, history)
    } catch (error) {
      this.setState({ loading: false, error: message(error), history: null, selectedId: null, loaded: null })
    }
  }

  private selectRevision = async (ref: RevisionRef, history = this.state.history) => {
    if (!history) return
    const token = ++this.loadToken
    this.setState({ selectedId: ref.id, loading: true, error: null })
    try {
      const loaded = await loadRevision(this.props.fs, history.projectKey, ref)
      if (token !== this.loadToken) return
      this.setState({ loaded, loading: false })
    } catch (error) {
      if (token !== this.loadToken) return
      this.setState({ loading: false, error: message(error), loaded: null })
    }
  }

  render() {
    const { onClose, session } = this.props
    const { loading, error, history, selectedId, loaded } = this.state
    const revisions = history?.session.revisions ?? []

    return (
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <HistoryIcon />
              <span>System Prompt History</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={session.id ?? session.path}>
              {session.id ?? session.path}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={this.refresh} className="rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground">Refresh</button>
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground">Close</button>
          </div>
        </div>

        {error && (
          <div className="m-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {!error && !loading && !history && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No recorded system prompt for this session yet. Reload the Pi extension and run at least one agent turn.
          </div>
        )}

        {history && (
          <>
            <div className="border-b border-border/70 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{revisions.length} revision{revisions.length === 1 ? '' : 's'}</span>
                <span className="truncate font-mono" title={history.projectRoot}>{history.projectRoot ?? shortHash(history.projectKey)}</span>
              </div>
              <select
                value={selectedId ?? ''}
                onChange={(event) => {
                  const ref = revisions.find((item) => item.id === event.currentTarget.value)
                  if (ref) void this.selectRevision(ref)
                }}
                className="h-8 w-full rounded-md border border-border/70 bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-info/50"
              >
                {revisions.slice().reverse().map((ref) => (
                  <option key={ref.id} value={ref.id}>
                    v{ref.version} · {shortHash(ref.id)} · {formatTime(ref.at)}
                  </option>
                ))}
              </select>
            </div>

            {loaded && (
              <div className="grid grid-cols-3 gap-px border-b border-border/70 bg-border/70 text-center text-[10px]">
                <div className="bg-background px-2 py-2"><div className="font-mono text-xs text-foreground">{loaded.manifest.lines}</div><div className="text-muted-foreground">lines</div></div>
                <div className="bg-background px-2 py-2"><div className="font-mono text-xs text-foreground">{formatBytes(loaded.manifest.bytes)}</div><div className="text-muted-foreground">size</div></div>
                <div className="bg-background px-2 py-2"><div className="font-mono text-xs text-foreground">{loaded.manifest.chunks.length}</div><div className="text-muted-foreground">chunks</div></div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto bg-surface/15">
              {loading && !loaded ? (
                <div className="p-4 text-sm text-muted-foreground">Loading system prompt…</div>
              ) : loaded ? (
                <pre className="min-w-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-foreground selection:bg-info/20">{loaded.prompt}</pre>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">No revision selected.</div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionToolbarItem({
    id: TOOLBAR_ID,
    title: 'System Prompt',
    panelId: PANEL_ID,
    hostSlot: 'system-prompt-tools',
    render: (props: PsmSessionUiRenderProps) => createElement(ToolbarButton, {
      open: Boolean(props.panelOpen),
      onToggle: props.togglePanel ?? (() => {}),
    }),
  })

  ctx.ui.registerSessionPanel({
    id: PANEL_ID,
    title: 'System Prompt History',
    side: 'right',
    render: (props: PsmSessionUiRenderProps) => createElement(PromptHistoryPanel, {
      fs: ctx.psm.fs,
      session: props.session,
      open: Boolean(props.panelOpen),
      onClose: props.closePanel ?? (() => {}),
    }),
  })
}
