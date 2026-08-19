import { defineConfig } from "vitest/config";

// Aparte config voor metingen die minuten duren (rendertijd). Bewust NIET in
// vitest.config.mts, zodat `npm test` snel blijft.
//   npx vitest run --config vitest.bench.config.mts
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
});
