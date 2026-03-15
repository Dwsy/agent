import type { CapabilitySupportLevel, ChannelOutbound, ChannelPlugin } from "../plugins/types.ts";

type ChannelWithOutbound<K extends keyof ChannelOutbound> = ChannelPlugin & {
  outbound: ChannelOutbound & Required<Pick<ChannelOutbound, K>>;
};

function isLevelSupported(level?: CapabilitySupportLevel): boolean | undefined {
  if (level === undefined) return undefined;
  return level !== "none";
}

export function supportsMessagePost(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.messaging?.post;
  if (typeof matrix === "boolean") return matrix;
  return true;
}

export function canPostMessage(channel: ChannelPlugin): channel is ChannelWithOutbound<"sendText"> {
  return supportsMessagePost(channel) && typeof channel.outbound.sendText === "function";
}

export function supportsMediaUpload(channel: ChannelPlugin): boolean {
  const matrix = isLevelSupported(channel.capabilities.matrix?.messaging?.fileUpload);
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.sendMedia === "function";
  return channel.capabilities.media ?? typeof channel.outbound.sendMedia === "function";
}

export function supportsMessageEdit(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.messaging?.edit;
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.editMessage === "function";
  return channel.capabilities.editable ?? typeof channel.outbound.editMessage === "function";
}

export function supportsMessageDelete(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.messaging?.delete;
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.deleteMessage === "function";
  return channel.capabilities.deletable ?? typeof channel.outbound.deleteMessage === "function";
}

export function supportsReactions(channel: ChannelPlugin): boolean {
  const matrix = isLevelSupported(channel.capabilities.matrix?.conversation?.reactions);
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.sendReaction === "function";
  return channel.capabilities.reactions ?? typeof channel.outbound.sendReaction === "function";
}

export function supportsReadHistory(channel: ChannelPlugin): boolean {
  const matrix = isLevelSupported(channel.capabilities.matrix?.history?.fetchMessages);
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.readHistory === "function";
  return channel.capabilities.history ?? typeof channel.outbound.readHistory === "function";
}

export function supportsKeyboardButtons(channel: ChannelPlugin): boolean {
  const matrix = isLevelSupported(channel.capabilities.matrix?.richContent?.buttons);
  if (typeof matrix === "boolean") return matrix && typeof channel.outbound.sendKeyboard === "function";
  return typeof channel.outbound.sendKeyboard === "function";
}

export function supportsKeyboardMarkupEdit(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.interaction?.messageUpdate;
  if (matrix === "native") return typeof channel.outbound.editMessageMarkup === "function";
  if (matrix === "resend" || matrix === "none") return false;
  return typeof channel.outbound.editMessageMarkup === "function";
}

export function supportsInteractionCallbacks(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.interaction?.callbacks;
  if (typeof matrix === "boolean") return matrix;
  return Boolean(channel.interactions);
}

export function supportsInteractionAck(channel: ChannelPlugin): boolean {
  const matrix = channel.capabilities.matrix?.interaction?.ack;
  if (typeof matrix === "boolean") return matrix;
  return Boolean(channel.interactions);
}

export function canSendMedia(channel: ChannelPlugin): channel is ChannelWithOutbound<"sendMedia"> {
  return supportsMediaUpload(channel) && typeof channel.outbound.sendMedia === "function";
}

export function canEditMessage(channel: ChannelPlugin): channel is ChannelWithOutbound<"editMessage"> {
  return supportsMessageEdit(channel) && typeof channel.outbound.editMessage === "function";
}

export function canDeleteMessage(channel: ChannelPlugin): channel is ChannelWithOutbound<"deleteMessage"> {
  return supportsMessageDelete(channel) && typeof channel.outbound.deleteMessage === "function";
}

export function canSendReaction(channel: ChannelPlugin): channel is ChannelWithOutbound<"sendReaction"> {
  return supportsReactions(channel) && typeof channel.outbound.sendReaction === "function";
}

export function canReadHistory(channel: ChannelPlugin): channel is ChannelWithOutbound<"readHistory"> {
  return supportsReadHistory(channel) && typeof channel.outbound.readHistory === "function";
}

export function canSendKeyboard(channel: ChannelPlugin): channel is ChannelWithOutbound<"sendKeyboard"> {
  return supportsKeyboardButtons(channel) && typeof channel.outbound.sendKeyboard === "function";
}

export function canEditKeyboardMarkup(channel: ChannelPlugin): channel is ChannelWithOutbound<"editMessageMarkup"> {
  return supportsKeyboardMarkupEdit(channel) && typeof channel.outbound.editMessageMarkup === "function";
}
