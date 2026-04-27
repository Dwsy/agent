import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/examples/**"]
    },
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.json"
    }
  },
  resolve: {
    alias: {
      "pi-tui-kit": "/src/index.ts"
    }
  }
});
