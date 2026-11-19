import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run the engine and workspace logic only, without the TanStack Start plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
