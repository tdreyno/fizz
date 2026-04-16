import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    client: "src/test-app/client.tsx",
  },
  outDir: "dist-test-app/public",
  platform: "browser",
  format: ["esm"],
  clean: false,
  deps: {
    onlyAllowBundle: false,
    alwaysBundle: [
      /^@tdreyno\/fizz(\/.*)?$/,
      /^@tdreyno\/fizz-react(\/.*)?$/,
      /^react(\/.*)?$/,
      /^react-dom(\/.*)?$/,
    ],
  },
  dts: false,
  sourcemap: true,
})
