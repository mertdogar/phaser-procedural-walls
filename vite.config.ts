import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  build: {
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
});
