import { dirname, join, relative, resolve } from "node:path"

import type { CliIo, ParsedCliArgs } from "../index.js"
import {
  findCandidateBySource,
  getOptionValue,
  getOptionValues,
  loadMachineCandidates,
} from "../machineDiscovery.js"
import type { MachineCandidate, MachineGraph } from "./machineGraph.js"
import { buildMachineGraph } from "./machineGraph.js"
import { renderMachineGraphMermaid } from "./renderMermaid.js"
import { renderMachineGraphSvg } from "./renderSvg.js"
import { renderMachineGraphText } from "./renderText.js"

type OutputFormat = "mermaid" | "svg" | "text"

const VISUALIZE_HELP = `fizz visualize\n\nUsage:\n  fizz visualize [options]\n\nOptions:\n  --machine <name>      Select a discovered machine by name\n  --source <path>       Select a specific machine entrypoint or states index file\n  --format <type>       Output format: text, svg, or mermaid. Repeat to render multiple\n  --output <path>       Output file path when rendering a single format\n  --output-dir <path>   Output directory for generated files\n  --cwd <path>          Root directory to search. Defaults to the current working directory\n  --no-interactive      Fail instead of prompting for missing inputs\n  -h, --help            Show this help text\n`

const parseFormats = (values: Array<string>): Array<OutputFormat> => {
  const formats = values.flatMap(value =>
    value
      .split(",")
      .map(item => item.trim().toLowerCase())
      .filter(item => item.length > 0),
  )

  return Array.from(new Set(formats)).filter(
    (format): format is OutputFormat =>
      format === "mermaid" || format === "svg" || format === "text",
  )
}

const promptForFormats = async (io: CliIo): Promise<Array<OutputFormat>> => {
  const answer = await io.promptSelect("Choose output format", [
    { label: "Text", value: "text" },
    { label: "SVG", value: "svg" },
    { label: "Mermaid", value: "mermaid" },
    { label: "Text and SVG", value: "text,svg" },
    { label: "Text and Mermaid", value: "text,mermaid" },
    { label: "SVG and Mermaid", value: "svg,mermaid" },
    { label: "Text, SVG, and Mermaid", value: "text,svg,mermaid" },
  ])

  return parseFormats([answer])
}

const findCandidateByName = (
  candidates: Array<MachineCandidate>,
  name: string,
): MachineCandidate | undefined =>
  candidates.find(
    candidate => candidate.name.toLowerCase() === name.toLowerCase(),
  )

const promptForCandidate = async (
  candidates: Array<MachineCandidate>,
  io: CliIo,
): Promise<MachineCandidate> => {
  const selectedName = await io.promptSelect(
    "Choose a Fizz machine to visualize",
    candidates.map(candidate => ({
      label: `${candidate.name} (${candidate.sourceFilePath})`,
      value: candidate.name,
    })),
  )
  const selectedCandidate = findCandidateByName(candidates, selectedName)

  if (!selectedCandidate) {
    throw new Error(`Unable to resolve selected machine: ${selectedName}`)
  }

  return selectedCandidate
}

const getDefaultOutputPath = (
  format: OutputFormat,
  outputDirectory: string,
): string => {
  if (format === "mermaid") {
    return join(outputDirectory, "visualization.mmd")
  }

  return join(
    outputDirectory,
    format === "svg" ? "visualization.svg" : "visualization.txt",
  )
}

const writeGraphOutput = async (
  graph: MachineGraph,
  format: OutputFormat,
  targetPath: string,
): Promise<void> => {
  const fs = await import("node:fs/promises")
  const contents =
    format === "mermaid"
      ? renderMachineGraphMermaid(graph)
      : format === "svg"
        ? renderMachineGraphSvg(graph)
        : renderMachineGraphText(graph)

  await fs.mkdir(dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, contents, "utf8")
}

const resolveSelectedCandidate = async (
  candidates: Array<MachineCandidate>,
  parsedArgs: ParsedCliArgs,
  interactive: boolean,
  io: CliIo,
  rootDir: string,
): Promise<MachineCandidate | undefined> => {
  const sourceOption = getOptionValue(parsedArgs, "source")

  if (sourceOption) {
    const candidate = findCandidateBySource(
      candidates,
      resolve(rootDir, sourceOption),
    )

    if (candidate) {
      return candidate
    }
  }

  const machineOption = getOptionValue(parsedArgs, "machine")

  if (machineOption) {
    const candidate = findCandidateByName(candidates, machineOption)

    if (candidate) {
      return candidate
    }
  }

  if (!interactive && candidates.length === 1) {
    return candidates[0]
  }

  if (!interactive) {
    return undefined
  }

  return promptForCandidate(candidates, io)
}

const resolveFormats = async (
  parsedArgs: ParsedCliArgs,
  interactive: boolean,
  io: CliIo,
): Promise<Array<OutputFormat>> => {
  const requestedFormats = parseFormats(getOptionValues(parsedArgs, "format"))

  if (requestedFormats.length > 0) {
    return requestedFormats
  }

  if (!interactive) {
    return []
  }

  return promptForFormats(io)
}

export const executeVisualizeCommand = async (
  parsedArgs: ParsedCliArgs,
  io: CliIo,
): Promise<number> => {
  if (parsedArgs.options.help) {
    io.write(`${VISUALIZE_HELP}\n`)
    return 0
  }

  const rootDir = resolve(getOptionValue(parsedArgs, "cwd") ?? process.cwd())
  const interactive = !parsedArgs.options["no-interactive"]
  const sourceOption = getOptionValue(parsedArgs, "source")
  const { candidates, project } = await loadMachineCandidates(
    rootDir,
    sourceOption,
  )

  if (candidates.length === 0) {
    io.writeError(`No Fizz machines found under ${rootDir}\n`)
    return 1
  }

  const selectedCandidate = await resolveSelectedCandidate(
    candidates,
    parsedArgs,
    interactive,
    io,
    rootDir,
  )

  if (!selectedCandidate) {
    io.writeError(
      "Multiple or unspecified machines found. Provide --machine or --source, or run interactively.\n",
    )
    return 1
  }

  const formats = await resolveFormats(parsedArgs, interactive, io)

  if (formats.length === 0) {
    io.writeError(
      "No output formats selected. Provide --format text, --format svg, --format mermaid, or run interactively.\n",
    )
    return 1
  }

  const singleOutputPath = getOptionValue(parsedArgs, "output")

  if (singleOutputPath && formats.length !== 1) {
    io.writeError("--output can only be used when rendering a single format.\n")
    return 1
  }

  const outputDirectory = resolve(
    rootDir,
    getOptionValue(parsedArgs, "output-dir") ?? ".",
  )
  const graph = buildMachineGraph(project, selectedCandidate)
  const renderedGraph: MachineGraph = {
    ...graph,
    sourceFilePath:
      relative(rootDir, graph.sourceFilePath) || graph.sourceFilePath,
  }

  for (const format of formats) {
    const targetPath = resolve(
      rootDir,
      singleOutputPath ?? getDefaultOutputPath(format, outputDirectory),
    )

    await writeGraphOutput(renderedGraph, format, targetPath)
    io.write(`Wrote ${format.toUpperCase()} diagram to ${targetPath}\n`)
  }

  return 0
}
