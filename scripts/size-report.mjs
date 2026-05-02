import { gzipSync } from "node:zlib"
import { execSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { build } from "esbuild"

const rootDir = process.cwd()
const outputDir = path.join(rootDir, "size-reports")
const generatedDir = path.join(outputDir, "generated")
const bundleDir = path.join(generatedDir, "bundles")
const latestMarkdownPath = path.join(outputDir, "latest.md")

const scenarios = [
  {
    description:
      "Core machine + runtime entry path from @tdreyno/fizz root export.",
    entry: "scripts/size-fixtures/core-runtime.ts",
    id: "core-runtime",
    label: "Core Runtime",
  },
  {
    description:
      "Effect-heavy helpers (async, timers, batching, request JSON) from root export.",
    entry: "scripts/size-fixtures/core-effects.ts",
    id: "core-effects",
    label: "Core Effects",
  },
  {
    description:
      "DOM/browser helpers from the explicit @tdreyno/fizz/browser subpath.",
    entry: "scripts/size-fixtures/browser.ts",
    id: "browser-subpath",
    label: "Browser Subpath",
  },
  {
    description:
      "Nested-machine helpers from the explicit @tdreyno/fizz/nested subpath.",
    entry: "scripts/size-fixtures/nested.ts",
    id: "nested-subpath",
    label: "Nested Subpath",
  },
  {
    description:
      "Parallel machine API from the explicit @tdreyno/fizz/parallel subpath.",
    entry: "scripts/size-fixtures/parallel.ts",
    id: "parallel-machine",
    label: "Parallel Machine",
  },
  {
    description:
      "Fluent machine-builder API from @tdreyno/fizz/fluent subpath.",
    entry: "scripts/size-fixtures/fluent.ts",
    id: "fluent-subpath",
    label: "Fluent Subpath",
  },
]

const args = new Set(process.argv.slice(2))
const shouldSkipBuild = args.has("--skip-build")

const formatBytes = bytes => `${bytes.toLocaleString("en-US")} B`

const toRelative = filePath =>
  path.relative(rootDir, filePath).replaceAll("\\", "/")

const getTopContributors = ({ metafile, outfilePath }) => {
  const relativeOutfile = toRelative(outfilePath)
  const output = metafile.outputs[relativeOutfile]

  if (!output?.inputs) {
    return []
  }

  return Object.entries(output.inputs)
    .map(([file, info]) => ({
      bytesInOutput: info.bytesInOutput,
      file,
    }))
    .sort((a, b) => b.bytesInOutput - a.bytesInOutput)
    .slice(0, 5)
}

const runScenario = async scenario => {
  const outfilePath = path.join(bundleDir, `${scenario.id}.js`)

  const result = await build({
    bundle: true,
    entryPoints: [scenario.entry],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    minify: true,
    outfile: outfilePath,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
    treeShaking: true,
    write: true,
  })

  const bundledCode = await readFile(outfilePath)
  const gzipBytes = gzipSync(bundledCode).byteLength

  return {
    description: scenario.description,
    entry: scenario.entry,
    gzipBytes,
    id: scenario.id,
    label: scenario.label,
    minifiedBytes: bundledCode.byteLength,
    topContributors: getTopContributors({
      metafile: result.metafile,
      outfilePath,
    }),
  }
}

const createMarkdown = ({ measuredScenarios, report }) => {
  const summaryRows = measuredScenarios
    .map(
      scenario =>
        `| ${scenario.label} | ${formatBytes(scenario.minifiedBytes)} | ${formatBytes(scenario.gzipBytes)} |`,
    )
    .join("\n")

  const biggestByGzip = [...measuredScenarios]
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
    .slice(0, 3)

  const scenarioDetails = measuredScenarios
    .map(scenario => {
      const contributorRows = scenario.topContributors
        .map(
          contributor =>
            `| ${contributor.file} | ${formatBytes(contributor.bytesInOutput)} |`,
        )
        .join("\n")

      return [
        `### ${scenario.label}`,
        "",
        `- Entry: ${scenario.entry}`,
        `- Gzipped: ${formatBytes(scenario.gzipBytes)}`,
        `- Minified: ${formatBytes(scenario.minifiedBytes)}`,
        "",
        "Top contributors in output:",
        "",
        "| File | Bytes In Output |",
        "| --- | ---: |",
        contributorRows || "| n/a | n/a |",
      ].join("\n")
    })
    .join("\n\n")

  return [
    "# Fizz Bundle Size Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Node: ${report.environment.nodeVersion}`,
    `esbuild: ${report.environment.esbuildVersion}`,
    "",
    "## Scenario Summary",
    "",
    "| Scenario | Minified | Gzipped |",
    "| --- | ---: | ---: |",
    summaryRows,
    "",
    "## Largest Gzip Scenarios",
    "",
    ...biggestByGzip.map(
      scenario => `- ${scenario.label}: ${formatBytes(scenario.gzipBytes)}`,
    ),
    "",
    "## Scenario Details",
    "",
    scenarioDetails,
  ].join("\n")
}

if (!shouldSkipBuild) {
  execSync("npm run build --workspace @tdreyno/fizz", {
    cwd: rootDir,
    stdio: "inherit",
  })
}

await rm(generatedDir, { force: true, recursive: true })
await mkdir(bundleDir, { recursive: true })

const measuredScenarios = await Promise.all(scenarios.map(runScenario))

const report = {
  environment: {
    esbuildVersion: (await import("esbuild")).version,
    nodeVersion: process.version,
  },
  generatedAt: new Date().toISOString(),
  scenarios: measuredScenarios,
}

const markdown = createMarkdown({
  measuredScenarios,
  report,
})

await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8")

console.log(markdown)
