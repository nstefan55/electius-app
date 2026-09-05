import path from "node:path";
import { defineConfig } from "vitest/config";

// Server actions + utilities only (per context/ai-interaction.md) — no jsdom,
// no component tests. `server-only` is aliased to its own no-op export so
// modules that import it (lib/prisma, lib/rate-limit, ...) load under plain
// Node the way they do under Next's "react-server" condition.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Mjeri se SAMO ono sto se po invarijanti #8 i testira (src/actions + src/lib).
      // Globalni postotak bi brojao komponente koje namjerno nemaju testove.
      include: ["src/actions/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      // cobertura je jedini format koji actions/upload-code-coverage prima.
      reporter: ["text", "text-summary", "cobertura"],
      reportsDirectory: "coverage",
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
