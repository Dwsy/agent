import type { ChannelCapabilityMatrix } from "../plugins/types.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";

export interface ChannelCapabilitySnapshot {
  id: string;
  label: string;
  matrix?: ChannelCapabilityMatrix;
}

export function collectChannelCapabilityMatrix(registry: PluginRegistryState): ChannelCapabilitySnapshot[] {
  return Array.from(registry.channels.entries()).map(([id, channel]) => ({
    id,
    label: channel.meta.label,
    matrix: channel.capabilities.matrix,
  }));
}
