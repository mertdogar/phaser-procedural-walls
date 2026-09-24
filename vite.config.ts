import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => ({
  root: "demo",
  server: { port: 7070 },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./demo", import.meta.url)) },
  },
  build: mode === "editor" ? {
    outDir: "../dist/editor",
    emptyOutDir: true,
  } : {
    outDir: "../dist",
    emptyOutDir: true,
    lib: {
      entry: { index: "../src/index.ts", geometry: "../src/geometry.ts" },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: { external: ["phaser"] },
  },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
}));
