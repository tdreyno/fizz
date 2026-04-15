import { dirname, resolve } from "node:path"

import { Project } from "ts-morph"

import type { ParsedCliArgs } from "./index.js"
import type { MachineCandidate } from "./visualize/machineGraph.js"
import { discoverMachineCandidates } from "./visualize/machineGraph.js"

export const getOptionValues = (
  parsedArgs: ParsedCliArgs,
  key: string,
): Array<string> => {
  const optionValue = parsedArgs.options[key]

  if (optionValue === undefined || optionValue === true) {
    return []
  }

  return Array.isArray(optionValue) ? optionValue : [String(optionValue)]
}

export const getOptionValue = (
  parsedArgs: ParsedCliArgs,
  key: string,
): string | undefined => {
  const [value] = getOptionValues(parsedArgs, key)

  return value
}

export const findCandidateBySource = (
  candidates: Array<MachineCandidate>,
  sourcePath: string,
): MachineCandidate | undefined => {
  const normalizedSourcePath = resolve(sourcePath)

  return candidates.find(
    candidate =>
      candidate.sourceFilePath === normalizedSourcePath ||
      candidate.stateIndexPath === normalizedSourcePath,
  )
}

const createProjectForRoot = (filePaths: Array<string>): Project => {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      moduleResolution: 2,
      target: 99,
    },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
  })

  project.addSourceFilesAtPaths(filePaths)

  return project
}

export const loadMachineCandidates = async (
  rootDir: string,
  sourceOption?: string,
): Promise<{
  candidates: Array<MachineCandidate>
  project: Project
}> => {
  const searchRoot = sourceOption
    ? dirname(resolve(rootDir, sourceOption))
    : rootDir
  const sourceFiles =
    await discoverMachineCandidates.collectSourceFiles(searchRoot)
  const project = createProjectForRoot(sourceFiles)

  return {
    candidates: discoverMachineCandidates.findCandidates(project, rootDir),
    project,
  }
}
