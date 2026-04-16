import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    server: "src/test-app/server.ts",
  },
  outDir: "dist-test-app/server",
  platform: "node",
  target: "node20",
  format: ["esm"],
  clean: true,
  dts: false,
  sourcemap: true,
})
