// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Shyrka sur le Mac (issue #11) : en développement seulement, /shyrka-local mène à la
// passerelle locale (127.0.0.1:8179, `pnpm shyrka:passerelle`). Le jeton du jour est lu
// sur le Mac à chaque requête et posé par ce proxy : il n'entre jamais dans le navigateur.
// Le build de production n'a pas de proxy : la page y reste en démonstration.
const jetonPasserelle = () => {
  try {
    return readFileSync(join(homedir(), "oia-shyrka-data", "passerelle", "jeton"), "utf8").trim();
  } catch {
    return "";
  }
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        "/shyrka-local": {
          target: "http://127.0.0.1:8179",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/shyrka-local/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (req) => {
              const j = jetonPasserelle();
              if (j) req.setHeader("x-shyrka-jeton", j);
            });
          },
        },
      },
    },
  },
});
