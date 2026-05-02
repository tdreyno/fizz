import config from "@repo/eslint-config/eslint.config.js"
import { globalIgnores } from "eslint/config"

export default [
  globalIgnores(["dist-test-app/**", "src/coverage/**"]),
  ...config,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "no-undef": "off",
    },
  },
]
