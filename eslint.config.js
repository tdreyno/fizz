// @ts-check

import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"

export default tseslint.config(
  {
    ignores: [
      "dist/*",
      "test-npm-version/*",
      "svelte.config.js",
      "jest.config.js",
      "eslint.config.js",
      "commitlint.config.js",
    ],
  },
  eslint.configs.recommended,
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    rules: {
      "@typescript-eslint/consistent-indexed-object-style": 0,
      "@typescript-eslint/consistent-type-definitions": 0,
      "@typescript-eslint/array-type": 0,
      "@typescript-eslint/explicit-function-return-type": 0,
      "@typescript-eslint/require-await": 0,
      semi: ["error", "never"],
      "@typescript-eslint/member-delimiter-style": 0,
      "@typescript-eslint/explicit-module-boundary-types": 0,
      "@typescript-eslint/no-explicit-any": 0,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)
