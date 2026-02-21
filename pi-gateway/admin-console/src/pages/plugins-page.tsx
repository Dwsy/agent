import { useEffect } from 'react';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchPlugins } from '../lib/api';

type HookItem = string | { pluginId?: string; event?: string };

function Block({ title, items, formatItem }: { 
  title: string; 
  items: readonly (string | HookItem)[];
  formatItem?: (item: HookItem, index: number) => string;
}) {
  return (
    <article className="rounded-xl border border-slate-800 bg-card p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs text-slate-300">
        {items.slice(0, 12).map((item, index) => {
          const display = formatItem 
            ? formatItem(item as HookItem, index)
            : String(item);
          return (
            <li key={String(item) + index} className="rounded bg-slate-900 px-2 py-1 font-mono">
              {display}
            </li>
          );
        })}
        {items.length === 0 ? <li className="text-slate-500">empty</li> : null}
      </ul>
    </article>
  );
}

export function PluginsPage() {
  // 页面挂载埋点
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Plugins', { page: 'plugins' });
  }, []);

  // 使用 use-data-source 替换直接的 useQuery
  const pluginsQuery = usePageDataSource('plugins', ['plugins'], fetchPlugins);
  const data = pluginsQuery.data;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-card p-4 text-sm text-slate-300">
        Registry snapshot: channels {data?.channels.length ?? 0}, tools {data?.tools.length ?? 0}, commands {data?.commands.length ?? 0}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Block title="Channels" items={data?.channels ?? []} />
        <Block title="Tools" items={data?.tools ?? []} />
        <Block title="Commands" items={data?.commands ?? []} />
        <Block 
          title="Hooks" 
          items={data?.hooks ?? []}
          formatItem={(hook) => {
            if (typeof hook === 'string') return hook;
            return `${hook.pluginId} → ${hook.event}`;
          }}
        />
        <Block title="Services" items={data?.services ?? []} />
      </div>
    </div>
  );
}
