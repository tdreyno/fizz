export default {
  transformIgnorePatterns: [],
  preset: "ts-jest/presets/default-esm",
  rootDir: "src",
  testMatch: ["**/__tests__/**/?(*.)+(spec|test|steps).ts?(x)"],
  moduleFileExtensions: ["js", "json", "jsx", "ts", "tsx"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
}
