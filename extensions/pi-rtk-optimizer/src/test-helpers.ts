import { DEFAULT_RTK_INTEGRATION_CONFIG, type RtkIntegrationConfig } from "./types.ts";

export function runTest(name: string, testFn: () => void): void {
	testFn();
	console.log(`[PASS] ${name}`);
}

export function cloneDefaultConfig(): RtkIntegrationConfig {
	return structuredClone(DEFAULT_RTK_INTEGRATION_CONFIG);
}
