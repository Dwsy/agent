import { homedir } from "node:os";
import { join } from "node:path";

export const EXTENSION_NAME = "pi-rtk-optimizer";
export const CONFIG_DIR = join(homedir(), ".pi", "agent", "extensions", EXTENSION_NAME);
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
