import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export interface InterviewVoiceSettings {
	apiKey?: string;
	autoStart?: boolean;
	voiceId?: string;
	volume?: number;
}

export interface InterviewThemeSettings {
	mode?: "auto" | "light" | "dark";
	name?: string;
	lightPath?: string;
	darkPath?: string;
	toggleHotkey?: string;
}

export interface InterviewSettings {
	browser?: string;
	timeout?: number;
	port?: number;
	theme?: InterviewThemeSettings;
	voice?: InterviewVoiceSettings;
}

export function loadSettings(): InterviewSettings {
	try {
		const data = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
		return (data.interview as InterviewSettings) ?? {};
	} catch {
		return {};
	}
}

export function updateVoiceSettings(updates: Partial<InterviewVoiceSettings>): void {
	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
	} catch {}

	if (!settings.interview) {
		settings.interview = {};
	}
	const interview = settings.interview as Record<string, unknown>;

	if (!interview.voice) {
		interview.voice = {};
	}
	const voice = interview.voice as Record<string, unknown>;

	if (updates.autoStart !== undefined) {
		voice.autoStart = updates.autoStart;
	}
	if (updates.voiceId !== undefined) {
		voice.voiceId = updates.voiceId;
	}
	if (updates.volume !== undefined) {
		voice.volume = updates.volume;
	}

	const dir = dirname(SETTINGS_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
