/** @jest-environment node */

import { describe, expect, test } from "@jest/globals"

import type { CliIo } from "../cli/index.js"
import { parseCliArgs, runCli } from "../cli/index.js"

const createIo = (): {
  io: CliIo
  stderr: Array<string>
  stdout: Array<string>
} => {
  const stderr: Array<string> = []
  const stdout: Array<string> = []

  return {
    io: {
      promptInput: async () => {
        throw new Error("promptInput should not be called")
      },
      promptSelect: async () => {
        throw new Error("promptSelect should not be called")
      },
      write: message => {
        stdout.push(message)
      },
      writeError: message => {
        stderr.push(message)
      },
    },
    stderr,
    stdout,
  }
}

describe("cli", () => {
  test("parses inline, repeated, boolean, and positional arguments", () => {
    expect(
      parseCliArgs([
        "visualize",
        "--format=svg",
        "--source",
        "machine.ts",
        "--tag",
        "alpha",
        "--tag",
        "beta",
        "--verbose",
        "-h",
        "--",
        "--literal",
        "tail",
      ]),
    ).toEqual({
      command: "visualize",
      options: {
        format: "svg",
        help: true,
        source: "machine.ts",
        tag: ["alpha", "beta"],
        verbose: true,
      },
      positionals: ["--literal", "tail"],
    })
  })

  test("treats long options without a value as booleans", () => {
    expect(parseCliArgs(["machines", "--source", "-h"])).toEqual({
      command: "machines",
      options: {
        help: true,
        source: true,
      },
      positionals: [],
    })
  })

  test("shows root help when no command is provided", async () => {
    const { io, stderr, stdout } = createIo()

    await expect(runCli([], io)).resolves.toBe(0)

    expect(stderr).toEqual([])
    expect(stdout.join("")).toContain("Usage:")
    expect(stdout.join("")).toContain("visualize")
  })

  test("writes an error for unknown commands", async () => {
    const { io, stderr, stdout } = createIo()

    await expect(runCli(["unknown"], io)).resolves.toBe(1)

    expect(stdout).toEqual([])
    expect(stderr.join("")).toContain("Unknown command: unknown")
    expect(stderr.join("")).toContain("Usage:")
  })
})
