import { getGlimpse, isMacOS } from "../glimpse.ts";

const activeWindows = new Set<any>();

interface StreamingWindowState {
  contentIndex: number;
  window: any | null;
  lastMarkup: string;
  updateTimer: ReturnType<typeof setTimeout> | null;
  ready: boolean;
  title: string;
  width: number;
  height: number;
  floating: boolean;
}

let streamingState: StreamingWindowState | null = null;

function escapeJsString(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/<\/script>/gi, "<\\/script>");
}

function shellHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box}
body{margin:0;padding:1rem;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0f141a;color:#e5edf5}
@keyframes _fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
</style>
</head><body><div id="root"></div>
<script>
window._morphReady=false;
window._pending='';
window._setContent=function(html){
  if(!window._morphReady){window._pending=html;return;}
  var root=document.getElementById('root');
  var target=document.createElement('div');
  target.id='root';
  target.innerHTML=html;
  morphdom(root,target,{
    onBeforeElUpdated:function(from,to){ if(from.isEqualNode(to)) return false; return true; },
    onNodeAdded:function(node){
      if(node.nodeType===1 && node.tagName!=='STYLE' && node.tagName!=='SCRIPT'){
        node.style.animation='_fadeIn 0.25s ease both';
      }
      return node;
    }
  });
};
window._runScripts=function(){
  document.querySelectorAll('#root script').forEach(function(old){
    var s=document.createElement('script');
    if(old.src){ s.src=old.src; } else { s.textContent=old.textContent; }
    old.parentNode.replaceChild(s,old);
  });
};
</script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"
  onload="window._morphReady=true;if(window._pending){window._setContent(window._pending);window._pending='';}"></script>
</body></html>`;
}

function wrapStandaloneHtml(html: string) {
  const trimmed = html.trim();
  if (/<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return html;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:1rem;background:#0f141a;color:#e5edf5;font-family:Inter,system-ui,-apple-system,sans-serif">${html}</body></html>`;
}

function trackWindow(win: any) {
  activeWindows.add(win);
  win.on("closed", () => activeWindows.delete(win));
  return win;
}

export async function openHtmlWindow(options: {
  title: string;
  html: string;
  width?: number;
  height?: number;
  floating?: boolean;
}) {
  if (!isMacOS()) {
    return null;
  }
  const { open } = await getGlimpse();
  const win = open(wrapStandaloneHtml(options.html), {
    width: options.width ?? 1360,
    height: options.height ?? 920,
    title: options.title,
    floating: options.floating ?? false,
  });
  return trackWindow(win);
}

export function beginStreamingWidget(options: {
  contentIndex: number;
  title?: string;
  width?: number;
  height?: number;
  floating?: boolean;
}) {
  streamingState = {
    contentIndex: options.contentIndex,
    window: null,
    lastMarkup: "",
    updateTimer: null,
    ready: false,
    title: options.title ?? "CodeMap",
    width: options.width ?? 1360,
    height: options.height ?? 920,
    floating: options.floating ?? false,
  };
}

export function getStreamingWidgetState() {
  return streamingState;
}

export async function pushStreamingWidgetMarkup(markup: string, options?: {
  title?: string;
  width?: number;
  height?: number;
  floating?: boolean;
}) {
  if (!streamingState || !isMacOS()) {
    return;
  }
  if (!markup || markup.length < 20 || markup === streamingState.lastMarkup) {
    return;
  }

  streamingState.lastMarkup = markup;
  if (options?.title) streamingState.title = options.title;
  if (options?.width) streamingState.width = options.width;
  if (options?.height) streamingState.height = options.height;
  if (typeof options?.floating === "boolean") streamingState.floating = options.floating;

  if (streamingState.updateTimer) {
    return;
  }

  streamingState.updateTimer = setTimeout(async () => {
    if (!streamingState) {
      return;
    }
    streamingState.updateTimer = null;

    if (!streamingState.window) {
      const { open } = await getGlimpse();
      const win = open(shellHtml(), {
        width: streamingState.width,
        height: streamingState.height,
        title: streamingState.title,
        floating: streamingState.floating,
      });
      streamingState.window = trackWindow(win);
      win.on("ready", () => {
        if (!streamingState) {
          return;
        }
        streamingState.ready = true;
        const escaped = escapeJsString(streamingState.lastMarkup);
        win.send(`window._setContent('${escaped}')`);
      });
      return;
    }

    if (streamingState.ready) {
      const escaped = escapeJsString(streamingState.lastMarkup);
      streamingState.window.send(`window._setContent('${escaped}')`);
    }
  }, 150);
}

export async function finalizeStreamingWidget(markup?: string) {
  if (!streamingState || !streamingState.window || !streamingState.ready) {
    return;
  }
  if (markup) {
    streamingState.lastMarkup = markup;
  }
  const escaped = escapeJsString(streamingState.lastMarkup);
  streamingState.window.send(`window._setContent('${escaped}'); window._runScripts();`);
}

export function consumeStreamingWindow() {
  const state = streamingState;
  streamingState = null;
  return state;
}

export function clearStreamingWindow() {
  if (streamingState?.updateTimer) {
    clearTimeout(streamingState.updateTimer);
  }
  streamingState = null;
}

export async function closeAllHtmlWindows() {
  clearStreamingWindow();
  for (const win of activeWindows) {
    try {
      win.close();
    } catch {
    }
  }
  activeWindows.clear();
}
