// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

export default {
  transformIgnorePatterns: [],

  // A preset that is used as a base for Jest's configuration
  preset: "ts-jest/presets/default-esm",

  // The root directory that Jest should scan for tests and modules within
  rootDir: "src",

  // The test environment that will be used for testing
  // testEnvironment: "node",

  // The glob patterns Jest uses to detect test files
  testMatch: ["**/__tests__/**/?(*.)+(spec|test|steps).ts?(x)"],

  // An array of file extensions your modules use
  moduleFileExtensions: ["js", "json", "jsx", "ts", "tsx"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  // A map from regular expressions to module names that allow to stub out resources with a single module
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
}
