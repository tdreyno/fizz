import { relative, resolve } from "node:path"

import type { CliIo, ParsedCliArgs } from "../index.js"
import {
  findCandidateBySource,
  getOptionValue,
  loadMachineCandidates,
} from "../machineDiscovery.js"

const MACHINES_HELP = `fizz machines\n\nUsage:\n  fizz machines [options]\n\nOptions:\n  --cwd <path>       Root directory to search. Defaults to the current working directory\n  --source <path>    Select a specific machine entrypoint or states index file\n  -h, --help         Show this help text\n`

export const executeMachinesCommand = async (
  parsedArgs: ParsedCliArgs,
  io: CliIo,
): Promise<number> => {
  if (parsedArgs.options.help) {
    io.write(`${MACHINES_HELP}\n`)
    return 0
  }

  const rootDir = resolve(getOptionValue(parsedArgs, "cwd") ?? process.cwd())
  const sourceOption = getOptionValue(parsedArgs, "source")
  const { candidates } = await loadMachineCandidates(rootDir, sourceOption)
  const selectedCandidates = sourceOption
    ? [
        findCandidateBySource(candidates, resolve(rootDir, sourceOption)),
      ].filter(candidate => candidate !== undefined)
    : candidates

  if (selectedCandidates.length === 0) {
    io.writeError(`No Fizz machines found under ${rootDir}\n`)
    return 1
  }

  selectedCandidates.forEach(candidate => {
    io.write(
      `${candidate.name}\t${relative(rootDir, candidate.sourceFilePath) || candidate.sourceFilePath}\n`,
    )
  })

  return 0
}
