export function getDefaultCharacters(): string[] {
  if (process.env.TERM === "xterm-ghostty") {
    return ["·", "✢", "✳", "✶", "✻", "*"];
  }

  return process.platform === "darwin"
    ? ["·", "✢", "✳", "✶", "✻", "✽"]
    : ["·", "✢", "*", "✶", "✻", "✽"];
}

export function getDefaultSpinnerFrames(): string[] {
  const characters = getDefaultCharacters();
  return [...characters, ...[...characters].reverse()];
}
