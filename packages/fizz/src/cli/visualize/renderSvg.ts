import type {
  MachineGraph,
  MachineState,
  MachineTransition,
} from "./machineGraph.js"

type LayoutNode = {
  height: number
  state: MachineState
  width: number
  x: number
  y: number
}

const NODE_HEIGHT = 68
const NODE_WIDTH = 188
const HORIZONTAL_GAP = 92
const VERTICAL_GAP = 124
const PADDING = 48

const escapeSvg = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const orderedStates = (graph: MachineGraph): Array<MachineState> => {
  const stateMap = new Map(graph.states.map(state => [state.name, state]))
  const visited = new Set<string>()
  const queue = [graph.entryState]
  const ordered: Array<MachineState> = []

  while (queue.length > 0) {
    const stateName = queue.shift()

    if (!stateName || visited.has(stateName)) {
      continue
    }

    visited.add(stateName)

    const state = stateMap.get(stateName)

    if (!state) {
      continue
    }

    ordered.push(state)

    state.transitions
      .filter(transition => transition.target !== state.name)
      .forEach(transition => queue.push(transition.target))
  }

  graph.states.forEach(state => {
    if (!visited.has(state.name)) {
      ordered.push(state)
    }
  })

  return ordered
}

const buildLayout = (graph: MachineGraph): Array<LayoutNode> =>
  orderedStates(graph).map((state, index) => {
    const row = Math.floor(index / 4)
    const column = index % 4

    return {
      height: NODE_HEIGHT,
      state,
      width: NODE_WIDTH,
      x: PADDING + column * (NODE_WIDTH + HORIZONTAL_GAP),
      y: 112 + row * (NODE_HEIGHT + VERTICAL_GAP),
    }
  })

const nodeCenterX = (node: LayoutNode): number => node.x + node.width / 2
const nodeCenterY = (node: LayoutNode): number => node.y + node.height / 2

const renderTransitionPath = (
  fromNode: LayoutNode,
  toNode: LayoutNode,
): { labelX: number; labelY: number; path: string } => {
  if (fromNode.state.name === toNode.state.name) {
    const startX = fromNode.x + fromNode.width - 24
    const startY = fromNode.y + 12
    const endX = fromNode.x + fromNode.width / 2
    const endY = fromNode.y
    const controlX = fromNode.x + fromNode.width + 34
    const controlY = fromNode.y - 42

    return {
      labelX: fromNode.x + fromNode.width + 18,
      labelY: fromNode.y - 26,
      path: `M ${startX} ${startY} C ${controlX} ${controlY}, ${controlX} ${controlY}, ${endX} ${endY}`,
    }
  }

  const startX = nodeCenterX(fromNode)
  const startY = nodeCenterY(fromNode)
  const endX = nodeCenterX(toNode)
  const endY = nodeCenterY(toNode)
  const isBackEdge = endX < startX
  const controlY = isBackEdge ? Math.max(fromNode.y, toNode.y) + 108 : startY

  return {
    labelX: (startX + endX) / 2,
    labelY: isBackEdge ? controlY + 10 : startY - 16,
    path: isBackEdge
      ? `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`
      : `M ${startX + NODE_WIDTH / 2 - 8} ${startY} L ${endX - NODE_WIDTH / 2 + 8} ${endY}`,
  }
}

const renderNode = (graph: MachineGraph, node: LayoutNode): string => {
  const isEntry = node.state.name === graph.entryState
  const isSpecial = node.state.name === "History"
  let fill = "#f8fafc"
  let stroke = "#0f172a"

  if (isSpecial) {
    fill = "#fff7ed"
    stroke = "#c2410c"
  } else if (isEntry) {
    fill = "#ecfeff"
    stroke = "#0f766e"
  }

  const dash = isSpecial ? ' stroke-dasharray="8 6"' : ""
  let subtitle: string | undefined

  if (node.state.kind === "nested-parent") {
    subtitle = "Nested state"
  } else if (node.state.kind === "nested-state") {
    subtitle = "Nested child"
  } else if (isEntry) {
    subtitle = "Entry state"
  }

  return [
    `
    <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="2.5"${dash} />`,
    `    <text x="${nodeCenterX(node)}" y="${node.y + 30}" class="node-label">${escapeSvg(node.state.name)}</text>`,
    subtitle
      ? `    <text x="${nodeCenterX(node)}" y="${node.y + 50}" class="node-subtitle">${escapeSvg(subtitle)}</text>`
      : "",
  ].join("\n")
}

const renderTransition = (
  nodeLookup: Map<string, LayoutNode>,
  fromNode: LayoutNode,
  transition: MachineTransition,
): string => {
  const toNode = nodeLookup.get(transition.target)

  if (!toNode) {
    return ""
  }

  const { labelX, labelY, path } = renderTransitionPath(fromNode, toNode)
  const stroke = transition.kind === "special" ? "#c2410c" : "#334155"
  const dash = transition.kind === "special" ? ' stroke-dasharray="7 5"' : ""
  const label = transition.note
    ? `${transition.action} (${transition.note})`
    : transition.action

  return [
    `
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.2" marker-end="url(#arrow)"${dash} />`,
    `    <text x="${labelX}" y="${labelY}" class="edge-label">${escapeSvg(label)}</text>`,
  ].join("\n")
}

const renderOutputsPanel = (
  graph: MachineGraph,
  width: number,
  height: number,
): string => {
  const outputs = Array.from(
    new Set(graph.states.flatMap(state => state.outputs)),
  )

  if (outputs.length === 0) {
    return ""
  }

  const panelWidth = 208
  const panelX = width - panelWidth - 28
  const panelY = Math.max(24, height - 48 - outputs.length * 20 - 54)

  return [
    `
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${56 + outputs.length * 20}" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />`,
    `    <text x="${panelX + 20}" y="${panelY + 26}" class="panel-title">Outputs</text>`,
    ...outputs.map(
      (output, index) =>
        `    <text x="${panelX + 20}" y="${panelY + 50 + index * 20}" class="panel-row">• ${escapeSvg(output)}</text>`,
    ),
  ].join("\n")
}

export const renderMachineGraphSvg = (graph: MachineGraph): string => {
  const layout = buildLayout(graph)
  const nodeLookup = new Map(layout.map(node => [node.state.name, node]))
  const width = Math.max(
    720,
    ...layout.map(node => node.x + node.width + PADDING),
  )
  const height = Math.max(
    340,
    ...layout.map(node => node.y + node.height + 150),
  )

  return [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">`,
    `  <title id="title">${escapeSvg(graph.name)} state diagram</title>`,
    `  <desc id="desc">State diagram for ${escapeSvg(graph.name)} with ${graph.states.length} nodes.</desc>`,
    "  <defs>",
    '    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">',
    '      <path d="M 0 0 L 10 5 L 0 10 Z" fill="#334155" />',
    "    </marker>",
    "    <style>",
    "      .title { font: 700 22px ui-sans-serif, system-ui, sans-serif; fill: #0f172a; }",
    "      .subtitle { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #475569; }",
    "      .node-label { font: 700 15px ui-sans-serif, system-ui, sans-serif; fill: #0f172a; text-anchor: middle; dominant-baseline: middle; }",
    "      .node-subtitle { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #475569; text-anchor: middle; dominant-baseline: middle; }",
    "      .edge-label { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #334155; text-anchor: middle; }",
    "      .panel-title { font: 700 13px ui-sans-serif, system-ui, sans-serif; fill: #0f172a; }",
    "      .panel-row { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #475569; }",
    "    </style>",
    "  </defs>",
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
    `  <text x="${PADDING}" y="42" class="title">${escapeSvg(graph.name)}</text>`,
    `  <text x="${PADDING}" y="64" class="subtitle">Entry state: ${escapeSvg(graph.entryState)}</text>`,
    ...layout.flatMap(node =>
      node.state.transitions.map(transition =>
        renderTransition(nodeLookup, node, transition),
      ),
    ),
    ...layout.map(node => renderNode(graph, node)),
    renderOutputsPanel(graph, width, height),
    "</svg>",
    "",
  ].join("\n")
}
