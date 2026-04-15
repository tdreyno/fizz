import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
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
  deps: {
    neverBundle: [
      "node:fs/promises",
      "node:readline/promises",
      "node:path",
      "node:process",
    ],
  },
})
