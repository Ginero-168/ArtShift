import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // App tsconfig keeps JSX for Next (`preserve`). Vitest's oxc transform must
  // compile component tests itself.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
