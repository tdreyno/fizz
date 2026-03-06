import { access, mkdir, readFile, writeFile } from "node:fs/promises"

const PACKAGES = ["fizz", "fizz-react", "fizz-svelte"]

const candidateReportPaths = ({ packageName }) => [
  `packages/${packageName}/coverage/lcov.info`,
  `packages/${packageName}/src/coverage/lcov.info`,
]

const fileExists = async path => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const normalizeSourcePath = ({ packageName, sourcePath }) => {
  const normalized = sourcePath.replaceAll("\\", "/")

  if (normalized.startsWith("/")) {
    return normalized
  }

  if (normalized.startsWith("packages/")) {
    return normalized
  }

  if (normalized.startsWith("./src/")) {
    return `packages/${packageName}/${normalized.slice(2)}`
  }

  if (normalized.startsWith("src/")) {
    return `packages/${packageName}/${normalized}`
  }

  return `packages/${packageName}/src/${normalized}`
}

const isTestCoveragePath = path =>
  path.includes("/__tests__/") ||
  path.includes(".spec.") ||
  path.includes(".test.")

const rewriteCoverageFile = ({ packageName, content }) =>
  content
    .split("end_of_record")
    .map(record => record.trim())
    .filter(Boolean)
    .flatMap(record => {
      const lines = record.split("\n")
      const sourceLine = lines.find(line => line.startsWith("SF:"))

      if (!sourceLine) {
        return []
      }

      const sourcePath = sourceLine.slice(3)
      const normalizedPath = normalizeSourcePath({ packageName, sourcePath })

      if (isTestCoveragePath(normalizedPath)) {
        return []
      }

      return [
        lines
          .map(line => (line.startsWith("SF:") ? `SF:${normalizedPath}` : line))
          .join("\n"),
      ]
    })
    .map(record => `${record}\nend_of_record`)
    .join("\n")

const collectCoverageFiles = async () => {
  const reports = await Promise.all(
    PACKAGES.map(async packageName => {
      const candidates = candidateReportPaths({ packageName })

      const existingPath = (
        await Promise.all(
          candidates.map(async path => ({
            exists: await fileExists(path),
            path,
          })),
        )
      ).find(({ exists }) => exists)?.path

      if (!existingPath) {
        return null
      }

      const content = await readFile(existingPath, "utf8")

      return rewriteCoverageFile({ packageName, content }).trim()
    }),
  )

  return reports.filter(Boolean)
}

const reports = await collectCoverageFiles()

if (reports.length === 0) {
  throw new Error(
    "No package LCOV reports found. Run `npm run test:ci` before preparing Sonar coverage.",
  )
}

await mkdir("coverage", { recursive: true })
await writeFile("coverage/sonar.lcov.info", `${reports.join("\n\n")}\n`, "utf8")

console.log(
  `Prepared Sonar coverage report from ${reports.length} package report(s): coverage/sonar.lcov.info`,
)
