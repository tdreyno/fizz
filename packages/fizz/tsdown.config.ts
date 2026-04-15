import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    test: "src/test.ts",
  },
  outDir: "dist",
  platform: "neutral",
  format: ["cjs", "esm"],
  clean: true,
  dts: true,
  sourcemap: true,
  unbundle: true,
})
