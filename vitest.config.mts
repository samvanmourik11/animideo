import { defineConfig } from "vitest/config";

// Tests draaien in Node, niet in een browser: alles wat we testen is bewust
// pure logica (het Timeline Document, straks EditorCore). Componenten en de
// Pixi-compositor testen we in de app zelf.
export default defineConfig({
  resolve: {
    // Zelfde padalias als tsconfig, anders werkt `@/lib/...` in tests niet.
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
