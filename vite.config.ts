import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    lib: {
      entry: "../src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: { external: ["phaser"] },
  },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
});
