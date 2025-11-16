// @ts-check

import { defineConfig, globalIgnores } from "eslint/config"
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"
import importPlugin from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"

const __dirname = import.meta.dirname

export default defineConfig(
  globalIgnores(["dist/*", "test-npm-version/*"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,
  importPlugin.flatConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        emcaVersion: "latest",
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: "module",
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
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
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "import/consistent-type-specifier-style": "error",
    },
  },
)
