import type { MachineGraph } from "./machineGraph.js"

const renderStateBlock = (graph: MachineGraph): Array<string> =>
  graph.states.flatMap(state => {
    const lines = [`- ${state.name}`]

    if (state.transitions.length > 0) {
      lines.push("  transitions:")
      lines.push(
        ...state.transitions.map(transition => {
          const note = transition.note ? ` (${transition.note})` : ""

          return `    - ${transition.action} -> ${transition.target}${note}`
        }),
      )
    }

    if (state.outputs.length > 0) {
      lines.push(`  outputs: ${state.outputs.join(", ")}`)
    }

    if (state.notes.length > 0) {
      lines.push("  notes:")
      lines.push(...state.notes.map(note => `    - ${note}`))
    }

    return lines
  })

export const renderMachineGraphText = (graph: MachineGraph): string => {
  const stateNames = graph.states
    .filter(state => state.filePath.length > 0)
    .map(state => state.name)
  const outputNames = Array.from(
    new Set(graph.states.flatMap(state => state.outputs)),
  ).sort((left, right) => left.localeCompare(right))

  return [
    "Fizz Machine Diagram",
    `Machine: ${graph.name}`,
    `Source: ${graph.sourceFilePath}`,
    `Entry: ${graph.entryState}`,
    "",
    "States",
    ...stateNames.map(stateName => `- ${stateName}`),
    "",
    "Details",
    ...renderStateBlock(graph),
    "",
    "Outputs",
    ...(outputNames.length > 0
      ? outputNames.map(outputName => `- ${outputName}`)
      : ["- None"]),
    "",
    "State Graph",
    ...graph.states.flatMap(state =>
      state.transitions.length === 0
        ? [`[${state.name}]`]
        : [
            `[${state.name}]`,
            ...state.transitions.map(
              transition => `  ${transition.action} -> [${transition.target}]`,
            ),
          ],
    ),
    "",
  ].join("\n")
}
