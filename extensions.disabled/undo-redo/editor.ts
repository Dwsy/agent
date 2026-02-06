import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { type KeyId, matchesKey } from "@mariozechner/pi-tui";

const DEFAULT_UNDO_KEYS: KeyId[] = ["ctrl+shift+z"];
const DEFAULT_REDO_KEYS: KeyId[] = ["ctrl+shift+y"];

function normalizeKeys(
	keys: KeyId | KeyId[] | undefined,
	fallback: KeyId[],
): KeyId[] {
	if (!keys) return fallback;
	return Array.isArray(keys) ? keys : [keys];
}

export class UndoRedoEditor extends CustomEditor {
	declare onSubmit?: (text: string) => void;
	private readonly undoKeys: KeyId[];
	private readonly redoKeys: KeyId[];

	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
	) {
		super(tui, theme, keybindings);

		const config = keybindings.getEffectiveConfig() as Record<
			string,
			KeyId | KeyId[] | undefined
		>;
		this.undoKeys = normalizeKeys(config.treeUndo, DEFAULT_UNDO_KEYS);
		this.redoKeys = normalizeKeys(config.treeRedo, DEFAULT_REDO_KEYS);
	}

	handleInput(data: string): void {
		if (this.matchesShortcut(data, this.undoKeys)) {
			this.triggerCommand("undo");
			return;
		}

		if (this.matchesShortcut(data, this.redoKeys)) {
			this.triggerCommand("redo");
			return;
		}

		super.handleInput(data);
	}

	private triggerCommand(command: "undo" | "redo"): void {
		this.onSubmit?.(`/${command}`);
	}

	private matchesShortcut(data: string, keys: KeyId[]): boolean {
		for (const key of keys) {
			if (matchesKey(data, key)) return true;
		}
		return false;
	}
}
