import { defineConfig } from "tsdown"

const entries = {
  background: "src/background.ts",
  content: "src/content.ts",
  devtools: "src/devtools.ts",
  inject: "src/inject.ts",
  index: "src/index.ts",
  panel: "src/panel.ts",
}

const sharedConfig = {
  outDir: "dist",
  platform: "browser" as const,
  format: ["esm"] as const,
  deps: {
    alwaysBundle: [/^@tdreyno\/fizz(\/.*)?$/],
  },
  dts: false,
  sourcemap: true,
}

export default Object.entries(entries).map(([name, entry], index) =>
  defineConfig({
    ...sharedConfig,
    entry: {
      [name]: entry,
    },
    clean: index === 0,
  }),
)
