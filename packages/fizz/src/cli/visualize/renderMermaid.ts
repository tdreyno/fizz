import type { MachineGraph, MachineState } from "./machineGraph.js"

const isRenderableState = (state: MachineState): boolean =>
  state.filePath.length > 0

const escapeComment = (value: string): string =>
  value.replaceAll("\n", " ").trim()

const escapeLabel = (value: string): string =>
  value.replaceAll("\n", " ").replaceAll('"', "'").trim()

const getNestedChildren = (graph: MachineGraph, parentName: string) =>
  graph.states.filter(state => state.nestedParentState === parentName)

const renderTransitionLine = (
  sourceName: string,
  action: string,
  targetName: string,
  note?: string,
): string => {
  const noteLabel = note ? ` (${note})` : ""

  return `${sourceName} --> ${targetName} : ${escapeLabel(`${action}${noteLabel}`)}`
}

const renderStateMetadata = (state: MachineState): Array<string> => [
  ...state.notes.map(note => `%% ${state.name} note: ${escapeComment(note)}`),
  ...state.outputs.map(
    output => `%% ${state.name} output: ${escapeComment(output)}`,
  ),
]

const renderNestedStateBlock = (
  graph: MachineGraph,
  parentState: MachineState,
): Array<string> => {
  const nestedChildren = getNestedChildren(graph, parentState.name).filter(
    child => child.filePath.length > 0,
  )

  if (nestedChildren.length === 0) {
    return [`state ${parentState.name}`]
  }

  return [
    `state ${parentState.name} {`,
    ...(parentState.nestedInitialState
      ? [`  [*] --> ${parentState.nestedInitialState}`]
      : []),
    ...nestedChildren.map(child => `  state ${child.name}`),
    ...nestedChildren.flatMap(child =>
      child.transitions.map(
        transition =>
          `  ${renderTransitionLine(
            child.name,
            transition.action,
            transition.target,
            transition.note,
          )}`,
      ),
    ),
    "}",
  ]
}

export const renderMachineGraphMermaid = (graph: MachineGraph): string => {
  const visibleStates = graph.states.filter(isRenderableState)
  const rootStates = visibleStates.filter(state => !state.nestedParentState)

  return [
    "stateDiagram-v2",
    `title ${graph.name} state diagram`,
    "",
    `%% Source: ${escapeComment(graph.sourceFilePath)}`,
    `%% Entry: ${escapeComment(graph.entryState)}`,
    "",
    ...visibleStates.flatMap(renderStateMetadata),
    ...(visibleStates.some(
      state => state.notes.length > 0 || state.outputs.length > 0,
    )
      ? [""]
      : []),
    `[*] --> ${graph.entryState}`,
    "",
    ...rootStates.flatMap(state =>
      state.kind === "nested-parent"
        ? renderNestedStateBlock(graph, state)
        : [`state ${state.name}`],
    ),
    "",
    ...rootStates.flatMap(state =>
      state.transitions.map(transition =>
        renderTransitionLine(
          state.name,
          transition.action,
          transition.target,
          transition.note,
        ),
      ),
    ),
    "",
  ].join("\n")
}
