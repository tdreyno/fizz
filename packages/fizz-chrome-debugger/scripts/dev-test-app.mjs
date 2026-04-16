import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(currentDir, "..")
const appUrl = "http://localhost:4311"
let browserOpened = false

const run = (command, args, options = {}) => {
  return spawn(command, args, {
    cwd: packageDir,
    env: process.env,
    stdio: options.stdio ?? "inherit",
  })
}

const runWithOutput = (command, args) => {
  return spawn(command, args, {
    cwd: packageDir,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  })
}

const openChrome = () => {
  if (browserOpened) {
    return
  }

  browserOpened = true

  if (process.platform === "darwin") {
    void run("open", ["-a", "Google Chrome", appUrl])
    return
  }

  if (process.platform === "win32") {
    void run("cmd", ["/c", "start", "chrome", appUrl])
    return
  }

  void run("google-chrome", [appUrl])
}

const prefixOutput = (child, prefix) => {
  child.stdout?.on("data", chunk => {
    const value = chunk.toString()

    process.stdout.write(`${prefix}${value}`)

    if (value.includes("Test app ready at")) {
      openChrome()
    }
  })

  child.stderr?.on("data", chunk => {
    process.stderr.write(`${prefix}${chunk.toString()}`)
  })
}

const initialBuild = run("npm", ["run", "build:test-app"])

initialBuild.on("exit", code => {
  if (code !== 0) {
    process.exit(code ?? 1)
  }

  const children = [
    run("npm", [
      "exec",
      "--",
      "tsdown",
      "--config",
      "tsdown.test-app.client.config.ts",
      "--watch",
    ]),
    run("npm", [
      "exec",
      "--",
      "tsdown",
      "--config",
      "tsdown.test-app.server.config.ts",
      "--watch",
    ]),
    runWithOutput("node", ["--watch", "dist-test-app/server/server.mjs"]),
  ]

  prefixOutput(children[2], "[test-app] ")

  const shutdown = () => {
    children.forEach(child => {
      child.kill("SIGTERM")
    })
  }

  process.on("SIGINT", () => {
    shutdown()
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    shutdown()
    process.exit(0)
  })

  children.forEach(child => {
    child.on("exit", code => {
      if (code && code !== 0) {
        shutdown()
        process.exit(code)
      }
    })
  })
})
