#!/usr/bin/env node

import { createDefaultCliIo, runCli } from "./cli/index.js"

const cliIo = createDefaultCliIo()

runCli(process.argv.slice(2), cliIo)
  .then(exitCode => {
    process.exitCode = exitCode
  })
  .catch(error => {
    const message = error instanceof Error ? error.message : String(error)

    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
