export type RtkRewriteCategory =
	| "gitGithub"
	| "filesystem"
	| "rust"
	| "javascript"
	| "python"
	| "go"
	| "containers"
	| "network"
	| "packageManagers";

export interface RtkRewriteRule {
	id: string;
	category: RtkRewriteCategory;
	matcher: RegExp;
	replacement: string;
	description: string;
}

export const RTK_REWRITE_RULES: RtkRewriteRule[] = [
	// Git / GitHub
	{
		id: "git-leading-flags-proxy",
		category: "gitGithub",
		matcher: /^git\s+-(.+)$/,
		replacement: "rtk proxy git -$1",
		description: "git with leading flags (e.g. -C, --no-pager) -> proxy",
	},
	{
		id: "git-any",
		category: "gitGithub",
		matcher: /^git\s+(.+)$/,
		replacement: "rtk git $1",
		description: "git <args> -> rtk git",
	},
	{
		id: "gh-leading-flags-proxy",
		category: "gitGithub",
		matcher: /^gh\s+-(.+)$/,
		replacement: "rtk proxy gh -$1",
		description: "gh with leading flags -> proxy",
	},
	{
		id: "gh-any",
		category: "gitGithub",
		matcher: /^gh\s+(.+)$/,
		replacement: "rtk gh $1",
		description: "gh <args> -> rtk gh",
	},

	// Filesystem / shell helpers
	{ id: "cat", category: "filesystem", matcher: /^cat\s+/, replacement: "rtk read ", description: "cat" },
	{
		id: "head-short-lines",
		category: "filesystem",
		matcher: /^head\s+-([0-9]+)\s+(.+)$/,
		replacement: "rtk read $2 --max-lines $1",
		description: "head -N <file>",
	},
	{
		id: "head-long-lines",
		category: "filesystem",
		matcher: /^head\s+--lines=([0-9]+)\s+(.+)$/,
		replacement: "rtk read $2 --max-lines $1",
		description: "head --lines=N <file>",
	},
	{
		id: "tail-short-lines",
		category: "filesystem",
		matcher: /^tail\s+-n\s*([0-9]+)\s+(.+)$/,
		replacement: "rtk read $2 --max-lines $1",
		description: "tail -n N <file>",
	},
	{
		id: "tail-long-lines",
		category: "filesystem",
		matcher: /^tail\s+--lines=([0-9]+)\s+(.+)$/,
		replacement: "rtk read $2 --max-lines $1",
		description: "tail --lines=N <file>",
	},
	{ id: "grep", category: "filesystem", matcher: /^(rg|grep)\s+/, replacement: "rtk grep ", description: "rg/grep" },
	{ id: "ls", category: "filesystem", matcher: /^ls\b/, replacement: "rtk ls", description: "ls" },
	{ id: "tree", category: "filesystem", matcher: /^tree\b/, replacement: "rtk tree", description: "tree" },
	{ id: "find", category: "filesystem", matcher: /^find\s+/, replacement: "rtk find ", description: "find" },
	{ id: "diff", category: "filesystem", matcher: /^diff\s+/, replacement: "rtk diff ", description: "diff" },
	{ id: "wc", category: "filesystem", matcher: /^wc\b/, replacement: "rtk wc", description: "wc" },
	{
		id: "powershell-proxy",
		category: "filesystem",
		matcher: /^(powershell(?:\.exe)?)\s+(.+)$/i,
		replacement: "rtk proxy $1 $2",
		description: "powershell -> proxy",
	},
	{
		id: "cmd-proxy",
		category: "filesystem",
		matcher: /^(cmd(?:\.exe)?)\s+(.+)$/i,
		replacement: "rtk proxy $1 $2",
		description: "cmd -> proxy",
	},
	{ id: "bash-proxy", category: "filesystem", matcher: /^bash\s+(.+)$/i, replacement: "rtk proxy bash $1", description: "bash -> proxy" },

	// Rust
	{
		id: "cargo-any",
		category: "rust",
		matcher: /^cargo\s+(.+)$/,
		replacement: "rtk cargo $1",
		description: "cargo <args> -> rtk cargo",
	},

	// JavaScript / TypeScript ecosystem
	{ id: "vitest", category: "javascript", matcher: /^vitest(?:\s+run)?\b/, replacement: "rtk vitest run", description: "vitest" },
	{ id: "npx-vitest", category: "javascript", matcher: /^npx\s+vitest(?:\s+run)?\b/, replacement: "rtk vitest run", description: "npx vitest" },
	{ id: "bunx-vitest", category: "javascript", matcher: /^bunx\s+vitest(?:\s+run)?\b/, replacement: "rtk vitest run", description: "bunx vitest" },
	{ id: "pnpm-vitest", category: "javascript", matcher: /^pnpm\s+(?:exec\s+)?vitest(?:\s+run)?\b/, replacement: "rtk vitest run", description: "pnpm vitest" },
	{
		id: "npm-run",
		category: "javascript",
		matcher: /^npm\s+run\s+(.+)$/,
		replacement: "rtk proxy npm run $1",
		description: "npm run <script> -> proxy",
	},
	{
		id: "npm-script-shorthand",
		category: "javascript",
		matcher: /^npm\s+(test|start|build|lint)\b(.*)$/,
		replacement: "rtk proxy npm $1$2",
		description: "npm test/start/build/lint -> proxy",
	},
	{ id: "tsc", category: "javascript", matcher: /^tsc\b/, replacement: "rtk tsc", description: "tsc" },
	{ id: "npx-tsc", category: "javascript", matcher: /^npx\s+tsc\b/, replacement: "rtk tsc", description: "npx tsc" },
	{ id: "bunx-tsc", category: "javascript", matcher: /^bunx\s+tsc\b/, replacement: "rtk tsc", description: "bunx tsc" },
	{ id: "pnpm-tsc", category: "javascript", matcher: /^pnpm\s+(?:exec\s+)?tsc\b/, replacement: "rtk tsc", description: "pnpm tsc" },
	{ id: "pnpm-typecheck", category: "javascript", matcher: /^pnpm\s+typecheck\b/, replacement: "rtk tsc", description: "pnpm typecheck" },
	{ id: "eslint", category: "javascript", matcher: /^eslint\b/, replacement: "rtk lint", description: "eslint" },
	{ id: "npx-eslint", category: "javascript", matcher: /^npx\s+eslint\b/, replacement: "rtk lint", description: "npx eslint" },
	{ id: "bunx-eslint", category: "javascript", matcher: /^bunx\s+eslint\b/, replacement: "rtk lint", description: "bunx eslint" },
	{ id: "pnpm-lint", category: "javascript", matcher: /^pnpm\s+lint\b/, replacement: "rtk lint", description: "pnpm lint" },
	{ id: "next", category: "javascript", matcher: /^next\b/, replacement: "rtk next", description: "next" },
	{ id: "npx-next", category: "javascript", matcher: /^npx\s+next\b/, replacement: "rtk next", description: "npx next" },
	{ id: "bunx-next", category: "javascript", matcher: /^bunx\s+next\b/, replacement: "rtk next", description: "bunx next" },
	{ id: "prettier", category: "javascript", matcher: /^prettier\b/, replacement: "rtk prettier", description: "prettier" },
	{ id: "npx-prettier", category: "javascript", matcher: /^npx\s+prettier\b/, replacement: "rtk prettier", description: "npx prettier" },
	{ id: "bunx-prettier", category: "javascript", matcher: /^bunx\s+prettier\b/, replacement: "rtk prettier", description: "bunx prettier" },
	{ id: "playwright", category: "javascript", matcher: /^playwright\b/, replacement: "rtk playwright", description: "playwright" },
	{ id: "npx-playwright", category: "javascript", matcher: /^npx\s+playwright\b/, replacement: "rtk playwright", description: "npx playwright" },
	{ id: "bunx-playwright", category: "javascript", matcher: /^bunx\s+playwright\b/, replacement: "rtk playwright", description: "bunx playwright" },
	{ id: "pnpm-playwright", category: "javascript", matcher: /^pnpm\s+playwright\b/, replacement: "rtk playwright", description: "pnpm playwright" },
	{ id: "prisma", category: "javascript", matcher: /^prisma\b/, replacement: "rtk prisma", description: "prisma" },
	{ id: "npx-prisma", category: "javascript", matcher: /^npx\s+prisma\b/, replacement: "rtk prisma", description: "npx prisma" },
	{ id: "bunx-prisma", category: "javascript", matcher: /^bunx\s+prisma\b/, replacement: "rtk prisma", description: "bunx prisma" },
	{ id: "pnpm-prisma", category: "javascript", matcher: /^pnpm\s+prisma\b/, replacement: "rtk prisma", description: "pnpm prisma" },
	{ id: "bun-proxy", category: "javascript", matcher: /^bun\s+(.+)$/, replacement: "rtk proxy bun $1", description: "bun -> proxy" },
	{ id: "node-proxy", category: "javascript", matcher: /^node\s+(.+)$/, replacement: "rtk proxy node $1", description: "node -> proxy" },
	{ id: "tsx-proxy", category: "javascript", matcher: /^tsx\s+(.+)$/, replacement: "rtk proxy tsx $1", description: "tsx -> proxy" },
	{ id: "npx-proxy", category: "javascript", matcher: /^npx\s+(.+)$/, replacement: "rtk proxy npx $1", description: "npx fallback -> proxy" },
	{ id: "bunx-proxy", category: "javascript", matcher: /^bunx\s+(.+)$/, replacement: "rtk proxy bunx $1", description: "bunx fallback -> proxy" },

	// Python
	{ id: "pytest", category: "python", matcher: /^pytest\b/, replacement: "rtk pytest", description: "pytest" },
	{ id: "python-pytest", category: "python", matcher: /^python(?:3(?:\.\d+)?)?\s+-m\s+pytest\b/, replacement: "rtk pytest", description: "python -m pytest" },
	{ id: "ruff", category: "python", matcher: /^ruff\b/, replacement: "rtk ruff", description: "ruff" },
	{ id: "python-ruff", category: "python", matcher: /^python(?:3(?:\.\d+)?)?\s+-m\s+ruff\b/, replacement: "rtk ruff", description: "python -m ruff" },
	{
		id: "pip",
		category: "python",
		matcher: /^pip\s+(list|outdated|install|uninstall|show)\b/,
		replacement: "rtk pip $1",
		description: "pip supported commands",
	},
	{
		id: "uv-pip",
		category: "python",
		matcher: /^uv\s+pip\s+(list|outdated|install|uninstall|show)\b/,
		replacement: "rtk pip $1",
		description: "uv pip supported commands",
	},
	{
		id: "python-pip",
		category: "python",
		matcher: /^python(?:3(?:\.\d+)?)?\s+-m\s+pip\s+(list|outdated|install|uninstall|show)\b/,
		replacement: "rtk pip $1",
		description: "python -m pip supported commands",
	},
	{
		id: "python-proxy",
		category: "python",
		matcher: /^(python(?:3(?:\.\d+)?)?)\s+(.+)$/,
		replacement: "rtk proxy $1 $2",
		description: "python fallback -> proxy while preserving executable token",
	},
	{ id: "poetry-proxy", category: "python", matcher: /^poetry\s+(.+)$/, replacement: "rtk proxy poetry $1", description: "poetry -> proxy" },

	// Go
	{ id: "go-any", category: "go", matcher: /^go\s+(.+)$/, replacement: "rtk go $1", description: "go <args> -> rtk go" },
	{ id: "golangci", category: "go", matcher: /^golangci-lint\b/, replacement: "rtk golangci-lint", description: "golangci-lint" },

	// Containers
	{
		id: "docker-compose",
		category: "containers",
		matcher: /^docker\s+compose\s+(.+)$/,
		replacement: "rtk docker compose $1",
		description: "docker compose",
	},
	{
		id: "docker",
		category: "containers",
		matcher: /^docker\s+(.+)$/,
		replacement: "rtk docker $1",
		description: "docker",
	},
	{
		id: "kubectl",
		category: "containers",
		matcher: /^kubectl\s+(.+)$/,
		replacement: "rtk kubectl $1",
		description: "kubectl",
	},

	// Network
	{ id: "curl", category: "network", matcher: /^curl\s+/, replacement: "rtk curl ", description: "curl" },
	{ id: "wget", category: "network", matcher: /^wget\s+/, replacement: "rtk wget ", description: "wget" },

	// Package managers
	{
		id: "npm-proxy",
		category: "packageManagers",
		matcher: /^npm\s+(.+)$/,
		replacement: "rtk proxy npm $1",
		description: "npm fallback -> proxy",
	},
	{
		id: "pnpm-leading-flags-proxy",
		category: "packageManagers",
		matcher: /^pnpm\s+-(.+)$/,
		replacement: "rtk proxy pnpm -$1",
		description: "pnpm with leading flags -> proxy",
	},
	{
		id: "pnpm-dlx-proxy",
		category: "packageManagers",
		matcher: /^pnpm\s+dlx\b(.*)$/,
		replacement: "rtk proxy pnpm dlx$1",
		description: "pnpm dlx -> proxy",
	},
	{
		id: "pnpm-any",
		category: "packageManagers",
		matcher: /^pnpm\s+(.+)$/,
		replacement: "rtk pnpm $1",
		description: "pnpm <args> -> rtk pnpm",
	},
];
