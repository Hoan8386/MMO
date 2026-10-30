// Builds the headless render page (renderer/app) that plays one component per job.
// No Motion Canvas editor: the page bootstraps the project itself (renderer/app/main.ts).
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Paths are relative to this file, so the build works from any working directory.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, "renderer/app"),
  base: "./",
  esbuild: { jsx: "automatic", jsxImportSource: "@motion-canvas/2d/lib" },
  build: { outDir: path.join(here, "renderer/dist"), emptyOutDir: true, target: "esnext", chunkSizeWarningLimit: 4000 },
  logLevel: "warn",
});
