import process from "node:process"

import { executeMachinesCommand } from "./machines/index.js"
import { executeVisualizeCommand } from "./visualize/index.js"

export type CliOptionValue = boolean | string | Array<string>

export type ParsedCliArgs = {
  command: string | undefined
  options: Record<string, CliOptionValue>
  positionals: Array<string>
}

export type PromptChoice = {
  label: string
  value: string
}

export type CliIo = {
  promptInput: (message: string) => Promise<string>
  promptSelect: (
    message: string,
    choices: Array<PromptChoice>,
  ) => Promise<string>
  write: (message: string) => void
  writeError: (message: string) => void
}

const appendOptionValue = (
  existingValue: CliOptionValue | undefined,
  nextValue: string,
): CliOptionValue => {
  if (existingValue === undefined) {
    return nextValue
  }

  return Array.isArray(existingValue)
    ? [...existingValue, nextValue]
    : [String(existingValue), nextValue]
}

const isShortFlag = (value: string): boolean =>
  value.startsWith("-") && value.length === 2

const parseLongOption = (
  rawArgs: Array<string>,
  index: number,
  options: Record<string, CliOptionValue>,
): number => {
  const value = rawArgs[index]

  if (!value) {
    return index + 1
  }

  const [rawKey, inlineValue] = value.slice(2).split("=", 2)

  if (rawKey === undefined) {
    return index + 1
  }

  const key = rawKey.trim()

  if (!key) {
    return index + 1
  }

  if (inlineValue !== undefined) {
    options[key] = appendOptionValue(options[key], inlineValue)
    return index + 1
  }

  const nextValue = rawArgs[index + 1]

  if (!nextValue || nextValue.startsWith("-")) {
    options[key] = true
    return index + 1
  }

  options[key] = appendOptionValue(options[key], nextValue)

  return index + 2
}

const parseShortOption = (
  value: string,
  options: Record<string, CliOptionValue>,
): void => {
  const key = value === "-h" ? "help" : value.slice(1)

  options[key] = true
}

export const parseCliArgs = (rawArgs: Array<string>): ParsedCliArgs => {
  const positionals: Array<string> = []
  const options: Record<string, CliOptionValue> = {}

  let index = 0

  while (index < rawArgs.length) {
    const value = rawArgs[index]

    if (!value) {
      index += 1
      continue
    }

    if (value === "--") {
      positionals.push(...rawArgs.slice(index + 1))
      break
    }

    if (value.startsWith("--")) {
      index = parseLongOption(rawArgs, index, options)
      continue
    }

    if (isShortFlag(value)) {
      parseShortOption(value, options)
      index += 1
      continue
    }

    positionals.push(value)
    index += 1
  }

  const [command, ...rest] = positionals

  return {
    command,
    options,
    positionals: rest,
  }
}

const promptWithReadline = async (message: string): Promise<string> => {
  const readline = await import("node:readline/promises")

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    return (await rl.question(message)).trim()
  } finally {
    rl.close()
  }
}

export const createDefaultCliIo = (): CliIo => ({
  promptInput: async message => promptWithReadline(message),
  promptSelect: async (message, choices) => {
    const renderedChoices = choices
      .map((choice, index) => `  ${index + 1}. ${choice.label}`)
      .join("\n")
    const answer = await promptWithReadline(
      `${message}\n${renderedChoices}\n> `,
    )
    const selectedIndex = Number(answer) - 1

    if (Number.isInteger(selectedIndex) && choices[selectedIndex]) {
      return choices[selectedIndex].value
    }

    const selectedChoice = choices.find(choice => choice.value === answer)

    if (selectedChoice) {
      return selectedChoice.value
    }

    throw new Error(`Invalid selection: ${answer}`)
  },
  write: message => process.stdout.write(message),
  writeError: message => process.stderr.write(message),
})

const ROOT_HELP = `fizz\n\nUsage:\n  fizz <command> [options]\n\nCommands:\n  machines    List discovered Fizz machines\n  visualize   Discover a Fizz machine and write text, SVG, or Mermaid diagrams to disk\n\nGlobal options:\n  -h, --help  Show this help text\n`

export const runCli = async (
  rawArgs: Array<string>,
  io: CliIo,
): Promise<number> => {
  const parsedArgs = parseCliArgs(rawArgs)

  if (!parsedArgs.command) {
    io.write(`${ROOT_HELP}\n`)
    return 0
  }

  if (parsedArgs.command === "machines") {
    return executeMachinesCommand(parsedArgs, io)
  }

  if (parsedArgs.command === "visualize") {
    return executeVisualizeCommand(parsedArgs, io)
  }

  io.writeError(`Unknown command: ${parsedArgs.command}\n\n${ROOT_HELP}\n`)

  return 1
}
