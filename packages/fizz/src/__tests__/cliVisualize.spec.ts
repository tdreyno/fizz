/** @jest-environment node */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Project } from "ts-morph"

import type { CliIo } from "../cli/index.js"
import { runCli } from "../cli/index.js"
import {
  buildMachineGraph,
  discoverMachineCandidates,
} from "../cli/visualize/machineGraph.js"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(testDirectory, "..", "..")
const loadingMachineDirectory = resolve(packageRoot, "src/loadingMachine")
const loadingMachineSourcePath = resolve(loadingMachineDirectory, "index.ts")

const createProjectForRoot = async (searchRoot: string): Promise<Project> => {
  const sourceFiles =
    await discoverMachineCandidates.collectSourceFiles(searchRoot)
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      moduleResolution: 2,
      target: 99,
    },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
  })

  project.addSourceFilesAtPaths(sourceFiles)

  return project
}

const createNonInteractiveIo = (): {
  io: CliIo
  stderr: Array<string>
  stdout: Array<string>
} => {
  const stdout: Array<string> = []
  const stderr: Array<string> = []

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

describe("fizz visualize", () => {
  test("does not discover machines inside node_modules", async () => {
    const searchRoot = await mkdtemp(join(tmpdir(), "fizz-visualize-scan-"))

    try {
      const appMachineDir = resolve(searchRoot, "src/machine")
      const ignoredMachineDir = resolve(searchRoot, "node_modules/fake-machine")

      await mkdir(appMachineDir, { recursive: true })
      await mkdir(ignoredMachineDir, { recursive: true })

      await writeFile(
        resolve(appMachineDir, "Ready.ts"),
        [
          'import { state } from "../../state.js"',
          "",
          'export default state({}, { name: "Ready" })',
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(appMachineDir, "states.ts"),
        [
          'import Ready from "./Ready.js"',
          "",
          "export default { Ready }",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(ignoredMachineDir, "Ignored.ts"),
        [
          'import { state } from "../../state.js"',
          "",
          'export default state({}, { name: "Ignored" })',
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(ignoredMachineDir, "states.ts"),
        [
          'import Ignored from "./Ignored.js"',
          "",
          "export default { Ignored }",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(appMachineDir, "index.ts"),
        [
          'import { createMachine } from "../../createMachine.js"',
          'import States from "./states.js"',
          "",
          'export default createMachine({ name: "AppMachine", states: States })',
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(ignoredMachineDir, "index.ts"),
        [
          'import { createMachine } from "../../createMachine.js"',
          'import States from "./states.js"',
          "",
          'export default createMachine({ name: "IgnoredMachine", states: States })',
          "",
        ].join("\n"),
        "utf8",
      )

      const sourceFiles =
        await discoverMachineCandidates.collectSourceFiles(searchRoot)

      expect(sourceFiles).toContain(resolve(appMachineDir, "Ready.ts"))
      expect(sourceFiles).toContain(resolve(appMachineDir, "index.ts"))
      expect(sourceFiles).toContain(resolve(appMachineDir, "states.ts"))
      expect(sourceFiles).not.toContain(
        resolve(ignoredMachineDir, "Ignored.ts"),
      )
      expect(sourceFiles).not.toContain(resolve(ignoredMachineDir, "states.ts"))
      expect(sourceFiles).not.toContain(resolve(ignoredMachineDir, "index.ts"))
      const ignoredRootSourceFiles =
        await discoverMachineCandidates.collectSourceFiles(ignoredMachineDir)

      expect(ignoredRootSourceFiles).toEqual([])
    } finally {
      await rm(searchRoot, { force: true, recursive: true })
    }
  })

  test("builds the expected LoadingMachine graph", async () => {
    const project = await createProjectForRoot(loadingMachineDirectory)
    const candidates = discoverMachineCandidates.findCandidates(
      project,
      packageRoot,
    )
    const candidate = candidates.find(
      item => item.sourceFilePath === loadingMachineSourcePath,
    )

    expect(candidate).toBeDefined()

    if (!candidate) {
      throw new Error("LoadingMachine candidate was not discovered")
    }

    const graph = buildMachineGraph(project, candidate)
    const transitionSummary = Object.fromEntries(
      graph.states.map(state => [
        state.name,
        state.transitions.map(transition => ({
          action: transition.action,
          note: transition.note,
          target: transition.target,
        })),
      ]),
    )

    expect(graph.entryState).toBe("Initializing")
    expect(graph.states.map(state => state.name)).toEqual([
      "Initializing",
      "Loading",
      "Ready",
      "History",
    ])
    expect(transitionSummary).toEqual({
      History: [],
      Initializing: [
        { action: "StartLoading", note: undefined, target: "Loading" },
      ],
      Loading: [
        { action: "FinishedLoading", note: undefined, target: "Ready" },
        { action: "Update", note: undefined, target: "Loading" },
      ],
      Ready: [
        { action: "Reset", note: "history back", target: "History" },
        { action: "World", note: undefined, target: "Ready" },
      ],
    })
    expect(graph.states.find(state => state.name === "Ready")?.outputs).toEqual(
      ["Hello"],
    )
  })

  test("discovers only createMachine roots outside tests", async () => {
    const project = await createProjectForRoot(packageRoot)
    const candidates = discoverMachineCandidates.findCandidates(
      project,
      packageRoot,
    )

    expect(
      candidates.map(candidate => ({
        name: candidate.name,
        sourceFilePath: candidate.sourceFilePath,
      })),
    ).toEqual([
      {
        name: "LoadingMachine",
        sourceFilePath: loadingMachineSourcePath,
      },
    ])
  })

  test("discovers default-exported machine constants", async () => {
    const searchRoot = await mkdtemp(join(tmpdir(), "fizz-machine-root-"))

    try {
      const machineDirectory = resolve(searchRoot, "src/machine")

      await mkdir(machineDirectory, { recursive: true })
      await writeFile(
        resolve(machineDirectory, "Ready.ts"),
        [
          'import { state } from "../../state.js"',
          "",
          'export default state({}, { name: "Ready" })',
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(machineDirectory, "states.ts"),
        [
          'import Ready from "./Ready.js"',
          "",
          "export default { Ready }",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        resolve(machineDirectory, "index.ts"),
        [
          'import { createMachine } from "../../createMachine.js"',
          'import States from "./states.js"',
          "",
          'const AppMachine = createMachine({ name: "AppMachine", states: States })',
          "",
          "export default AppMachine",
          "",
        ].join("\n"),
        "utf8",
      )

      const project = await createProjectForRoot(searchRoot)
      const candidates = discoverMachineCandidates.findCandidates(
        project,
        searchRoot,
      )

      expect(candidates.map(candidate => candidate.name)).toEqual([
        "AppMachine",
      ])
    } finally {
      await rm(searchRoot, { force: true, recursive: true })
    }
  })

  test("lists discovered machines without prompting", async () => {
    const { io, stderr, stdout } = createNonInteractiveIo()
    const exitCode = await runCli(["machines", "--cwd", packageRoot], io)

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(stdout).toEqual(["LoadingMachine\tsrc/loadingMachine/index.ts\n"])
  })

  test("writes deterministic text and svg output without prompting", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "fizz-visualize-"))

    try {
      const { io, stderr, stdout } = createNonInteractiveIo()
      const exitCode = await runCli(
        [
          "visualize",
          "--cwd",
          packageRoot,
          "--source",
          "./src/loadingMachine/index.ts",
          "--format",
          "text",
          "--format",
          "svg",
          "--output-dir",
          outputDirectory,
          "--no-interactive",
        ],
        io,
      )

      const textOutput = await readFile(
        resolve(outputDirectory, "visualization.txt"),
        "utf8",
      )
      const svgOutput = await readFile(
        resolve(outputDirectory, "visualization.svg"),
        "utf8",
      )

      expect(exitCode).toBe(0)
      expect(stderr).toEqual([])
      expect(stdout.join("\n")).toContain("Wrote TEXT diagram")
      expect(stdout.join("\n")).toContain("Wrote SVG diagram")
      expect(textOutput).toContain("Source: src/loadingMachine/index.ts")
      expect(textOutput).toContain("StartLoading -> Loading")
      expect(textOutput).toContain("FinishedLoading -> Ready")
      expect(textOutput).toContain("Reset -> History (history back)")
      expect(svgOutput).toContain("LoadingMachine state diagram")
      expect(svgOutput).toContain("StartLoading")
      expect(svgOutput).toContain("FinishedLoading")
      expect(svgOutput).toContain("Reset (history back)")
    } finally {
      await rm(outputDirectory, { force: true, recursive: true })
    }
  })
})
