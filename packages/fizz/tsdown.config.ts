import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    browser: "src/browser/index.ts",
    browserEntrypoint: "src/browserEntrypoint.ts",
    cli: "src/cli.ts",
    debug: "src/debug.ts",
    fluent: "src/fluent.ts",
    index: "src/index.ts",
    nested: "src/nested.ts",
    parallel: "src/parallel.ts",
    registry: "src/registry.ts",
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
