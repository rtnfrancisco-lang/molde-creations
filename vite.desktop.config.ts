import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Static build for the Tauri desktop app. Independent from vite.config.ts (published build).
export default defineConfig({
  root: r("./desktop"),
  base: "./",
  publicDir: r("./public"),
  plugins: [tsconfigPaths({ root: r(".") }), react(), tailwindcss()],
  resolve: { alias: { "@": r("./src") } },
  build: {
    outDir: r("./dist-tauri"),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
  },
  worker: { format: "es" },
  server: { host: "localhost", port: 1420, strictPort: true },
  preview: { host: "localhost", port: 1420, strictPort: true },
});
