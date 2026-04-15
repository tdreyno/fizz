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
import { renderMachineGraphSvg } from "../cli/visualize/renderSvg.js"
import { renderMachineGraphText } from "../cli/visualize/renderText.js"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(testDirectory, "..", "..")
const loadingMachineDirectory = resolve(packageRoot, "src/loadingMachine")
const loadingMachineSourcePath = resolve(loadingMachineDirectory, "index.ts")
const nestedMachineDirectory = resolve(
  packageRoot,
  "src/__tests__/nestedMachine",
)
const nestedMachineSourcePath = resolve(nestedMachineDirectory, "index.ts")
const nestedMachineStateIndexPath = resolve(
  nestedMachineDirectory,
  "states/index.ts",
)
const nestedMachineSourceFiles = [
  resolve(nestedMachineDirectory, "index.ts"),
  resolve(nestedMachineDirectory, "actions/index.ts"),
  resolve(nestedMachineDirectory, "actions/CompletedForm.ts"),
  resolve(nestedMachineDirectory, "states/index.ts"),
  resolve(nestedMachineDirectory, "states/Complete.ts"),
  resolve(nestedMachineDirectory, "states/Entry/index.ts"),
  resolve(nestedMachineDirectory, "states/Entry/actions/index.ts"),
  resolve(nestedMachineDirectory, "states/Entry/actions/SetName.ts"),
  resolve(nestedMachineDirectory, "states/Entry/states/index.ts"),
  resolve(nestedMachineDirectory, "states/Entry/states/FormInvalid.ts"),
  resolve(nestedMachineDirectory, "states/Entry/states/FormValid.ts"),
  resolve(nestedMachineDirectory, "states/Entry/types.ts"),
]

const createProjectForRoot = async (searchRoot: string): Promise<Project> => {
  const sourceFiles =
    await discoverMachineCandidates.collectSourceFiles(searchRoot)
  return createProjectForFiles(sourceFiles)
}

const createProjectForFiles = (sourceFiles: Array<string>): Project => {
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

const createPromptingIo = (
  responses: Array<string>,
): {
  io: CliIo
  prompts: Array<{ choices: Array<string>; message: string }>
  stderr: Array<string>
  stdout: Array<string>
} => {
  const stdout: Array<string> = []
  const stderr: Array<string> = []
  const prompts: Array<{ choices: Array<string>; message: string }> = []

  return {
    io: {
      promptInput: async () => {
        throw new Error("promptInput should not be called")
      },
      promptSelect: async (message, choices) => {
        prompts.push({
          choices: choices.map(choice => choice.value),
          message,
        })

        const nextResponse = responses.shift()

        if (!nextResponse) {
          throw new Error(`No prompt response configured for: ${message}`)
        }

        return nextResponse
      },
      write: message => {
        stdout.push(message)
      },
      writeError: message => {
        stderr.push(message)
      },
    },
    prompts,
    stderr,
    stdout,
  }
}

describe("fizz visualize", () => {
  test("shows visualize help for visualize --help", async () => {
    const { io, stderr, stdout } = createNonInteractiveIo()
    const exitCode = await runCli(["visualize", "--help"], io)

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(stdout.join("")).toContain("fizz visualize")
    expect(stdout.join("")).toContain("--output-dir <path>")
    expect(stdout.join("")).not.toContain("Commands:\n  machines")
  })

  test("shows machines help for machines --help", async () => {
    const { io, stderr, stdout } = createNonInteractiveIo()
    const exitCode = await runCli(["machines", "--help"], io)

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(stdout.join("")).toContain("fizz machines")
    expect(stdout.join("")).toContain("--source <path>")
    expect(stdout.join("")).not.toContain("Commands:\n  machines")
  })

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

  test("renders nested machine relationships in graph, text, and svg output", () => {
    const project = createProjectForFiles(nestedMachineSourceFiles)
    const graph = buildMachineGraph(project, {
      name: "NestedMachine",
      sourceFilePath: nestedMachineSourcePath,
      stateIndexPath: nestedMachineStateIndexPath,
    })
    const textOutput = renderMachineGraphText(graph)
    const svgOutput = renderMachineGraphSvg(graph)

    expect(graph.entryState).toBe("Entry")
    expect(
      graph.states.map(state => ({
        name: state.name,
        nestedInitialState: state.nestedInitialState,
        nestedParentState: state.nestedParentState,
      })),
    ).toEqual([
      {
        name: "Complete",
        nestedInitialState: undefined,
        nestedParentState: undefined,
      },
      {
        name: "Entry",
        nestedInitialState: "FormInvalid",
        nestedParentState: undefined,
      },
      {
        name: "FormInvalid",
        nestedInitialState: undefined,
        nestedParentState: "Entry",
      },
      {
        name: "FormValid",
        nestedInitialState: undefined,
        nestedParentState: "Entry",
      },
    ])
    expect(
      graph.states.find(state => state.name === "FormInvalid")?.transitions,
    ).toEqual([
      { action: "SetName", kind: "self", target: "FormInvalid" },
      { action: "SetName", kind: "normal", target: "FormValid" },
    ])
    expect(textOutput).toContain("- Entry")
    expect(textOutput).toContain("  nested entry: FormInvalid")
    expect(textOutput).toContain("  nested states:")
    expect(textOutput).toContain("    - FormInvalid")
    expect(textOutput).toContain("    - FormValid")
    expect(textOutput).toContain("[Entry]")
    expect(textOutput).toContain("  contains -> [FormInvalid]")
    expect(textOutput).toContain("[FormInvalid]")
    expect(textOutput).toContain("  SetName -> [FormInvalid]")
    expect(textOutput).toContain("  SetName -> [FormValid]")
    expect(svgOutput).toContain("Nested machine: Entry")
    expect(svgOutput).toContain(">contains</text>")
    expect(svgOutput).toContain("FormInvalid")
    expect(svgOutput).toContain("FormValid")
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

  test("prompts for machine selection even when one machine is discovered", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "fizz-visualize-one-"))

    try {
      const { io, prompts, stderr, stdout } = createPromptingIo([
        "LoadingMachine",
        "text",
      ])
      const exitCode = await runCli(
        ["visualize", "--cwd", packageRoot, "--output-dir", outputDirectory],
        io,
      )

      expect(exitCode).toBe(0)
      expect(stderr).toEqual([])
      expect(prompts.map(prompt => prompt.message)).toEqual([
        "Choose a Fizz machine to visualize",
        "Choose output format",
      ])
      expect(prompts[0]?.choices).toEqual(["LoadingMachine"])
      expect(stdout.join("")).toContain("Wrote TEXT diagram")
    } finally {
      await rm(outputDirectory, { force: true, recursive: true })
    }
  })

  test("writes output to cwd when output-dir is omitted", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "fizz-visualize-cwd-"))

    try {
      const appMachineDir = resolve(workspaceRoot, "src/machine")

      await mkdir(appMachineDir, { recursive: true })
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

      const { io, stderr, stdout } = createNonInteractiveIo()
      const exitCode = await runCli(
        [
          "visualize",
          "--cwd",
          workspaceRoot,
          "--source",
          "./src/machine/index.ts",
          "--format",
          "text",
          "--no-interactive",
        ],
        io,
      )

      const textOutput = await readFile(
        resolve(workspaceRoot, "visualization.txt"),
        "utf8",
      )

      expect(exitCode).toBe(0)
      expect(stderr).toEqual([])
      expect(stdout.join("\n")).toContain(
        resolve(workspaceRoot, "visualization.txt"),
      )
      expect(textOutput).toContain("Machine: AppMachine")
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true })
    }
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
