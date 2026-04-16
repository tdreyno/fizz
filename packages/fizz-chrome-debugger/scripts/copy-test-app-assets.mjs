import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(currentDir, "..")
const sourcePath = resolve(packageDir, "src/test-app/index.html")
const targetDir = resolve(packageDir, "dist-test-app/public")
const targetPath = resolve(targetDir, "index.html")

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true })
}

cpSync(sourcePath, targetPath)
