import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias « @/ » des fichiers portés du prototype Lovable (src/oia), comme dans tsconfig.json.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src/oia", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
});
