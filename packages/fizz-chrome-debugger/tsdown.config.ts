import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    background: "src/background.ts",
    content: "src/content.ts",
    devtools: "src/devtools.ts",
    inject: "src/inject.ts",
    index: "src/index.ts",
    panel: "src/panel.ts",
  },
  outDir: "dist",
  platform: "browser",
  format: ["esm"],
  clean: true,
  dts: true,
  sourcemap: true,
})
