const TOOL_NAMES = new Set(['visualize_read_me', 'show_widget', 'browse_widgets'])

export const manifest = {
  manifestVersion: 1,
  id: 'local.generative-ui-renderer',
  name: 'Generative UI Renderer',
  version: '0.1.0',
  permissions: ['fs:read', 'windows:open'],
}

let widgetsClient = null
let windowsClient = null

function hostReact() {
  const react = globalThis.__PSM_HOST_REACT__
  if (!react) throw new Error('PSM host React runtime is not available')
  return react
}

function isObject(value) {
  return typeof value === 'object' && value !== null
}

function textValue(value, fallback = '') {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

function numberValue(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function prettyTitle(value) {
  return textValue(value, 'widget').replace(/_/g, ' ')
}

function kindLabel(isSVG) {
  return isSVG ? 'SVG' : 'HTML'
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function fileUrlFromPath(path) {
  const value = textValue(path).trim()
  if (!value) return ''
  if (value.startsWith('file://')) return value
  if (value.startsWith('/')) return `file://${value.split('/').map(encodeURIComponent).join('/')}`
  return value
}

function previewDocumentFromCode(code, isSVG) {
  const normalizedCode = textValue(code)
  const body = isSVG ? `<div class="svg-wrap">${normalizedCode}</div>` : normalizedCode
  return `<!doctype html>
<meta charset="utf-8">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:auto}.svg-wrap{min-height:100vh;display:grid;place-items:center;padding:16px}svg{max-width:100%;height:auto}</style>
<script>window.glimpse=window.glimpse||{send(data){window.parent&&window.parent.postMessage({type:'psm-generative-ui',data},'*')}};</script>
${body}`
}

function basename(path) {
  return textValue(path).split(/[\\/]/).filter(Boolean).pop() || ''
}

function isSafeWidgetFile(file) {
  return Boolean(file) && !file.includes('\0') && !file.includes('/') && !file.includes('\\') && !file.includes('..')
}

function getWidgetFile(args = {}, details = {}) {
  for (const value of [details.savedFile, details.file, details.filename, args.savedFile, args.file]) {
    const file = textValue(value).trim()
    if (isSafeWidgetFile(file)) return file
  }

  for (const value of [details.fullPath, args.fullPath]) {
    const file = basename(value).trim()
    if (isSafeWidgetFile(file)) return file
  }

  return ''
}

export function getPreviewFrameSource(args = {}, details = {}, htmlOutput = '') {
  const height = numberValue(details.height, numberValue(args.height, 360))

  const rawHtml = textValue(htmlOutput).trim()
  if (rawHtml) {
    const lower = rawHtml.toLowerCase()
    return {
      srcDoc: lower.startsWith('<!doctype') || lower.startsWith('<html')
        ? rawHtml
        : previewDocumentFromCode(rawHtml, false),
      height,
    }
  }

  const code = textValue(args.widget_code)
  if (!code.trim()) return { height }
  const lower = code.trimStart().toLowerCase()
  return {
    srcDoc: lower.startsWith('<!doctype') || lower.startsWith('<html')
      ? code
      : previewDocumentFromCode(code, Boolean(details.isSVG ?? code.trimStart().startsWith('<svg'))),
    height,
  }
}

function detailsFrom(data) {
  const message = isObject(data?.result?.message) ? data.result.message : undefined
  return isObject(message?.details) ? message.details : {}
}

function outputFrom(data) {
  return typeof data?.output === 'string' ? data.output : ''
}

export function buildPreviewDocument(code, isSVG = false) {
  return previewDocumentFromCode(code, isSVG)
}

export function summarizeShowWidget(args = {}, details = {}) {
  const width = numberValue(details.width, numberValue(args.width, 800))
  const height = numberValue(details.height, numberValue(args.height, 600))
  const isSVG = Boolean(details.isSVG ?? textValue(args.widget_code).trimStart().startsWith('<svg'))
  return {
    title: prettyTitle(details.title ?? args.title),
    sizeLabel: `${width}×${height}`,
    width,
    height,
    isSVG,
    kindLabel: kindLabel(isSVG),
    interactive: Boolean(args.interactive || details.messageData),
    savedFile: textValue(details.savedFile || ''),
    fullPath: textValue(details.fullPath || ''),
    messageData: details.messageData,
    closedReason: textValue(details.closedReason || ''),
    hasPreview: typeof args.widget_code === 'string' && args.widget_code.trim().length > 0,
  }
}

function summarizeWidgetRecord(record) {
  const width = numberValue(record?.width, 800)
  const height = numberValue(record?.height, 600)
  const isSVG = Boolean(record?.isSVG)
  return {
    title: textValue(record?.title, 'Untitled widget'),
    timestamp: textValue(record?.timestamp),
    file: textValue(record?.file),
    sizeLabel: `${width}×${height}`,
    kindLabel: kindLabel(isSVG),
    isSVG,
  }
}

export function summarizeBrowseWidgets(args = {}, details = {}, output = '') {
  const action = textValue(args.action, 'list')
  const rawWidgets = Array.isArray(details.widgets) ? details.widgets : []
  return {
    action,
    filename: textValue(details.filename ?? args.filename),
    title: prettyTitle(details.title ?? args.filename ?? details.filename ?? 'widget'),
    sizeLabel: details.width || details.height
      ? `${numberValue(details.width, 800)}×${numberValue(details.height, 600)}`
      : '',
    kindLabel: details.isSVG === undefined ? '' : kindLabel(Boolean(details.isSVG)),
    widgets: rawWidgets.map(summarizeWidgetRecord),
    output: textValue(output),
  }
}

function getGuidelineSummary(args, details) {
  const modules = Array.isArray(details.modules) ? details.modules : Array.isArray(args.modules) ? args.modules : []
  return modules.map((item) => textValue(item)).filter(Boolean)
}

function e(type, props, ...children) {
  return hostReact().createElement(type, props, ...children)
}

function Icon({ kind }) {
  const paths = {
    widget: 'M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13Zm4 1.5h3v3H7V7Zm7 0h3v3h-3V7ZM7 14h3v3H7v-3Zm7 0h3v3h-3v-3Z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    guide: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm0 0v16M8 7h8M8 11h8',
    open: 'M14 3h7v7M21 3l-9 9M10 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V14',
  }
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return e('svg', { viewBox: '0 0 24 24', className: 'h-4 w-4 shrink-0', 'aria-hidden': true, ...common }, e('path', { d: paths[kind] || paths.widget }))
}

function MetaPill({ children }) {
  return e('span', { className: 'rounded-sm border border-border/60 bg-surface/45 px-1.5 py-0.5 text-[11px] text-muted-foreground' }, children)
}

function JsonBlock({ value }) {
  return e('pre', { className: 'max-h-40 overflow-auto rounded-md border border-border/60 bg-background/45 p-2 text-xs text-muted-foreground' }, safeJson(value))
}

function PreviewFrame({ source, title }) {
  return e('iframe', {
    title: `${title} preview`,
    sandbox: 'allow-scripts',
    src: source.src || undefined,
    srcDoc: source.srcDoc || undefined,
    style: { height: `${source.height}px` },
    className: 'w-full rounded-md border border-border/60 bg-background',
  })
}

function PreviewWindowButton({ source, title, width, height, onError }) {
  const [opening, setOpening] = hostReact().useState(false)
  const canOpen = Boolean(windowsClient && (source?.srcDoc || source?.src))

  const openWindow = async (event) => {
    event.stopPropagation()
    if (!canOpen || opening) return
    setOpening(true)
    onError('')
    try {
      await windowsClient.open({
        title,
        html: source.srcDoc,
        url: source.src,
        width,
        height,
        floating: true,
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  return e('button', {
    type: 'button',
    className: `inline-flex h-7 items-center gap-1 rounded border border-border/70 bg-surface/55 px-2 text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`,
    title: canOpen ? 'Open preview in new window' : 'Preview is not ready',
    disabled: !canOpen || opening,
    onClick: openWindow,
  }, e(Icon, { kind: 'open' }), opening ? 'Opening' : 'Open')
}

function VisualizeReadMeRenderer({ resolvedData, context }) {
  const { args, entryId } = resolvedData
  const details = detailsFrom(resolvedData)
  const modules = getGuidelineSummary(args, details)
  const statusClass = context.disableSuccessStyle ? '' : 'success'

  return e('div', { className: `tool-execution ${statusClass}`.trim(), id: `entry-${entryId}` },
    e('div', { className: 'tool-header' },
      e('span', { className: 'tool-name inline-flex items-center gap-1.5' }, e(Icon, { kind: 'guide' }), 'Generative UI guidelines'),
      e('span', { className: 'tool-meta' }, modules.length ? modules.join(', ') : 'loaded'),
    ),
  )
}

function ShowWidgetRenderer({ resolvedData, context }) {
  const { args, isError, entryId } = resolvedData
  const details = detailsFrom(resolvedData)
  const summary = summarizeShowWidget(args, details)
  const widgetFile = getWidgetFile(args, details)
  const [savedSource, setSavedSource] = hostReact().useState(null)
  const [savedError, setSavedError] = hostReact().useState('')
  const [windowError, setWindowError] = hostReact().useState('')

  hostReact().useEffect(() => {
    let cancelled = false
    setSavedSource(null)
    setSavedError('')

    if (!widgetFile || !widgetsClient) {
      return () => {
        cancelled = true
      }
    }

    widgetsClient.readHtml(widgetFile).then((result) => {
      if (cancelled) return
      setSavedSource(getPreviewFrameSource(args, details, result?.html || ''))
    }).catch((error) => {
      if (cancelled) return
      setSavedError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      cancelled = true
    }
  }, [widgetFile])

  const previewSource = savedSource || getPreviewFrameSource(args, details)
  const hasPreview = Boolean(previewSource.src || previewSource.srcDoc)
  const hasDetails = hasPreview || Boolean(summary.fullPath || summary.savedFile || summary.messageData || summary.closedReason || savedError || windowError)
  const statusClass = isError ? 'error' : context.disableSuccessStyle ? '' : 'success'

  return e('div', { className: `tool-execution ${statusClass}`.trim(), id: `entry-${entryId}` },
    e('div', { className: `tool-header ${hasDetails ? 'select-none' : ''}`, onClick: hasDetails ? context.toggleExpanded : undefined },
      hasDetails ? e('span', { className: 'tool-expand-indicator' }, context.isExpanded ? '▾' : '▸') : null,
      e('span', { className: 'tool-name inline-flex items-center gap-1.5' }, e(Icon, { kind: 'widget' }), summary.title),
      e('span', { className: 'tool-meta' }, summary.sizeLabel),
      e('span', { className: 'tool-meta' }, summary.kindLabel),
      summary.interactive ? e('span', { className: 'tool-meta' }, 'interactive') : null,
    ),
    hasDetails ? e('div', { className: `tool-output-wrapper collapsible ${context.isExpanded ? 'expanded' : ''}` },
      e('div', { className: `tool-expand-content ${context.isExpanded ? 'expanded' : ''}` },
        context.isExpanded ? e('div', { className: 'space-y-3 p-3 text-sm' },
          e('div', { className: 'flex flex-wrap gap-2' },
            summary.savedFile ? e(MetaPill, null, summary.savedFile) : null,
            summary.fullPath ? e(MetaPill, null, summary.fullPath) : null,
            summary.closedReason ? e(MetaPill, null, summary.closedReason) : null,
            hasPreview ? e(PreviewWindowButton, { source: previewSource, title: summary.title, width: summary.width, height: Math.max(summary.height, previewSource.height || 0), onError: setWindowError }) : null,
          ),
          hasPreview ? e(PreviewFrame, { source: previewSource, title: summary.title }) : null,
          savedError ? e('div', { className: 'rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive' }, savedError) : null,
          windowError ? e('div', { className: 'rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive' }, windowError) : null,
          summary.messageData !== undefined && summary.messageData !== null ? e(JsonBlock, { value: summary.messageData }) : null,
        ) : null,
      ),
    ) : null,
  )
}

function BrowseWidgetsRenderer({ resolvedData, context }) {
  const { args, output, isError, entryId } = resolvedData
  const details = detailsFrom(resolvedData)
  const summary = summarizeBrowseWidgets(args, details, outputFrom(resolvedData) || output)
  const hasDetails = summary.widgets.length > 0 || Boolean(summary.output || summary.filename)
  const statusClass = isError ? 'error' : context.disableSuccessStyle ? '' : 'success'
  const meta = summary.action === 'list'
    ? `${summary.widgets.length} widget${summary.widgets.length === 1 ? '' : 's'}`
    : summary.filename || summary.title
  const htmlPreviewSource = summary.action === 'html' && summary.output.trimStart().startsWith('<')
    ? getPreviewFrameSource({}, details, summary.output)
    : null

  return e('div', { className: `tool-execution ${statusClass}`.trim(), id: `entry-${entryId}` },
    e('div', { className: `tool-header ${hasDetails ? 'select-none' : ''}`, onClick: hasDetails ? context.toggleExpanded : undefined },
      hasDetails ? e('span', { className: 'tool-expand-indicator' }, context.isExpanded ? '▾' : '▸') : null,
      e('span', { className: 'tool-name inline-flex items-center gap-1.5' }, e(Icon, { kind: 'list' }), `Widgets ${summary.action}`),
      e('span', { className: 'tool-meta' }, meta),
    ),
    hasDetails ? e('div', { className: `tool-output-wrapper collapsible ${context.isExpanded ? 'expanded' : ''}` },
      e('div', { className: `tool-expand-content ${context.isExpanded ? 'expanded' : ''}` },
        context.isExpanded ? e('div', { className: 'space-y-2 p-3 text-sm' },
          summary.widgets.length > 0 ? e('div', { className: 'space-y-2' }, ...summary.widgets.map((widget) =>
            e('div', { key: widget.file || widget.title, className: 'rounded-md border border-border/60 bg-surface/35 p-2.5' },
              e('div', { className: 'flex items-start justify-between gap-3' },
                e('div', { className: 'min-w-0' },
                  e('div', { className: 'truncate font-medium text-foreground' }, widget.title),
                  e('div', { className: 'mt-1 truncate text-xs text-muted-foreground' }, widget.file),
                ),
                e('div', { className: 'flex shrink-0 gap-1.5' }, e(MetaPill, null, widget.sizeLabel), e(MetaPill, null, widget.kindLabel)),
              ),
            ),
          )) : null,
          htmlPreviewSource ? e(PreviewFrame, { source: htmlPreviewSource, title: summary.title }) : null,
          summary.output && summary.action !== 'list' && !(summary.action === 'html' && summary.output.trimStart().startsWith('<'))
            ? e('div', { className: 'whitespace-pre-wrap rounded-md border border-border/60 bg-background/35 p-2.5 text-xs text-muted-foreground' }, summary.output)
            : null,
          summary.filename && summary.action !== 'list' ? e('div', { className: 'flex flex-wrap gap-2' }, e(MetaPill, null, summary.filename), summary.sizeLabel ? e(MetaPill, null, summary.sizeLabel) : null, summary.kindLabel ? e(MetaPill, null, summary.kindLabel) : null) : null,
        ) : null,
      ),
    ) : null,
  )
}

function GenerativeUiRenderer(props) {
  const name = props?.resolvedData?.name
  if (name === 'visualize_read_me') return e(VisualizeReadMeRenderer, props)
  if (name === 'show_widget') return e(ShowWidgetRenderer, props)
  return e(BrowseWidgetsRenderer, props)
}

function getSearchSegments(_toolCall, data) {
  const details = detailsFrom(data)
  const segments = [data.name, outputFrom(data)]
  if (data.name === 'show_widget') {
    const summary = summarizeShowWidget(data.args, details)
    segments.push(summary.title, summary.savedFile, summary.fullPath, summary.kindLabel)
  } else if (data.name === 'browse_widgets') {
    const summary = summarizeBrowseWidgets(data.args, details, outputFrom(data))
    segments.push(summary.action, summary.filename, ...summary.widgets.flatMap((widget) => [widget.title, widget.file, widget.kindLabel]))
  } else {
    segments.push(...getGuidelineSummary(data.args, details))
  }
  return segments.filter(Boolean)
}

function getPreview(_toolCall, data) {
  const details = detailsFrom(data)
  if (data.name === 'show_widget') {
    const summary = summarizeShowWidget(data.args, details)
    return `${summary.title} · ${summary.sizeLabel} · ${summary.kindLabel}`
  }
  if (data.name === 'browse_widgets') {
    const summary = summarizeBrowseWidgets(data.args, details, outputFrom(data))
    return summary.action === 'list' ? `${summary.widgets.length} widgets` : summary.filename || summary.output || 'widgets'
  }
  return `Guidelines: ${getGuidelineSummary(data.args, details).join(', ') || 'loaded'}`
}

export const generativeUiToolRenderer = {
  id: 'local-generative-ui-renderer',
  name: 'Generative UI Renderer',
  match: (toolCall) => TOOL_NAMES.has(toolCall?.name),
  priority: 130,
  component: GenerativeUiRenderer,
  getSearchSegments,
  getPreview,
}

export default function activate(ctx) {
  widgetsClient = ctx.psm?.widgets || null
  windowsClient = ctx.psm?.windows || null
  ctx.ui.registerToolRenderer(generativeUiToolRenderer)
  return {
    dispose() {
      widgetsClient = null
      windowsClient = null
    },
  }
}
