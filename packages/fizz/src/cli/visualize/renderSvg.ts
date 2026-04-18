import type {
  MachineGraph,
  MachineState,
  MachineTransition,
} from "./machineGraph.js"

type LayoutNode = {
  height: number
  isNested: boolean
  state: MachineState
  width: number
  x: number
  y: number
}

type EdgeSide = "bottom" | "left" | "right" | "top"

type TransitionSpec = {
  fromNode: LayoutNode
  toNode: LayoutNode
  transition: MachineTransition
}

type TransitionRouting = {
  pairSeenCount: Map<string, number>
  pairUsageCount: Map<string, number>
  sourceOffsetsByIndex: Map<number, number>
  sourceSidesByIndex: Map<number, EdgeSide>
  targetOffsetsByIndex: Map<number, number>
  targetSidesByIndex: Map<number, EdgeSide>
}

type NestedGroup = {
  height: number
  initialChildName?: string
  parentName: string
  width: number
  x: number
  y: number
}

const NODE_HEIGHT = 68
const NODE_WIDTH = 188
const HORIZONTAL_GAP = 170
const VERTICAL_GAP = 104
const PADDING = 48
const TOP_PADDING = 112
const SVG_VIEWPORT_MARGIN_X = 170
const SVG_VIEWPORT_MARGIN_Y = 210
const PORT_LANE_STEP = 52
const CURVE_BASE = 52
const CURVE_LANE_MULTIPLIER = 52
const CURVE_ROUTE_MULTIPLIER_X = 2.2
const CURVE_ROUTE_MULTIPLIER_Y = 8
const CURVE_STRENGTH_SAME_ROW = 150
const CURVE_STRENGTH_DIAGONAL = 100
const LONG_HOP_ARC_UP = 300
const LONG_HOP_ARC_DOWN = 320

const escapeSvg = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const toLayeredRootStateLayers = (
  graph: MachineGraph,
): Array<Array<MachineState>> => {
  const rootStates = graph.states.filter(state => !state.nestedParentState)
  const stateByName = new Map(rootStates.map(state => [state.name, state]))
  const rootNames = rootStates.map(state => state.name)
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()

  rootNames.forEach(name => {
    outgoing.set(name, new Set<string>())
    incoming.set(name, new Set<string>())
  })

  rootStates.forEach(state => {
    state.transitions.forEach(transition => {
      if (!stateByName.has(transition.target)) {
        return
      }

      outgoing.get(state.name)?.add(transition.target)
      incoming.get(transition.target)?.add(state.name)
    })
  })

  const indegree = new Map(
    rootNames.map(name => [name, incoming.get(name)?.size ?? 0]),
  )
  const starts = [
    graph.entryState,
    ...rootNames.filter(
      name => (indegree.get(name) ?? 0) === 0 && name !== graph.entryState,
    ),
  ].filter(
    (name, index, all) => all.indexOf(name) === index && stateByName.has(name),
  )
  const visited = new Set<string>()
  const depthByName = new Map<string, number>()
  const queue = starts.length > 0 ? [...starts] : [rootNames[0]!]

  queue.forEach(start => {
    depthByName.set(start, 0)
  })

  while (queue.length > 0) {
    const stateName = queue.shift()

    if (!stateName || visited.has(stateName)) {
      continue
    }

    visited.add(stateName)

    const currentDepth = depthByName.get(stateName) ?? 0

    ;[...(outgoing.get(stateName) ?? new Set<string>())].forEach(nextName => {
      if (nextName === stateName) {
        return
      }

      const existingDepth = depthByName.get(nextName)

      if (existingDepth === undefined || existingDepth > currentDepth + 1) {
        depthByName.set(nextName, currentDepth + 1)
      }

      queue.push(nextName)
    })
  }

  let maxDepth = Math.max(0, ...depthByName.values())

  rootNames.forEach(name => {
    if (depthByName.has(name)) {
      return
    }

    maxDepth += 1
    depthByName.set(name, maxDepth)
  })

  const layersByDepth = new Map<number, Array<MachineState>>()

  rootStates.forEach(state => {
    const depth = depthByName.get(state.name) ?? 0
    const existing = layersByDepth.get(depth) ?? []

    layersByDepth.set(depth, [...existing, state])
  })

  const orderedDepths = [...layersByDepth.keys()].sort(
    (left, right) => left - right,
  )
  const orderByName = new Map<string, number>()

  orderedDepths.forEach(depth => {
    const layer = layersByDepth.get(depth) ?? []

    if (depth === 0) {
      const sorted = [...layer].sort((left, right) =>
        left.name.localeCompare(right.name),
      )

      sorted.forEach((state, index) => {
        orderByName.set(state.name, index)
      })
      layersByDepth.set(depth, sorted)
      return
    }

    const sorted = [...layer].sort((left, right) => {
      const leftParents = [...(incoming.get(left.name) ?? new Set<string>())]
      const rightParents = [...(incoming.get(right.name) ?? new Set<string>())]
      const leftScore =
        leftParents.length === 0
          ? Number.MAX_SAFE_INTEGER
          : leftParents.reduce(
              (sum, parent) => sum + (orderByName.get(parent) ?? 0),
              0,
            ) / leftParents.length
      const rightScore =
        rightParents.length === 0
          ? Number.MAX_SAFE_INTEGER
          : rightParents.reduce(
              (sum, parent) => sum + (orderByName.get(parent) ?? 0),
              0,
            ) / rightParents.length

      return leftScore === rightScore
        ? left.name.localeCompare(right.name)
        : leftScore - rightScore
    })

    sorted.forEach((state, index) => {
      orderByName.set(state.name, index)
    })
    layersByDepth.set(depth, sorted)
  })

  return orderedDepths.map(depth => layersByDepth.get(depth) ?? [])
}

const getNestedChildren = (graph: MachineGraph, parentName: string) =>
  graph.states.filter(state => state.nestedParentState === parentName)

const buildLayout = (graph: MachineGraph): Array<LayoutNode> =>
  toLayeredRootStateLayers(graph).flatMap((layer, layerIndex) => {
    const layerX = PADDING + layerIndex * (NODE_WIDTH + HORIZONTAL_GAP)

    return layer.reduce(
      (accumulator, state) => {
        const y = accumulator.nextY
        const nestedChildren = getNestedChildren(graph, state.name)
        const parentNode: LayoutNode = {
          height: NODE_HEIGHT,
          isNested: false,
          state,
          width: NODE_WIDTH,
          x: layerX,
          y,
        }
        const nestedNodes = nestedChildren.map((child, childIndex) => ({
          height: NODE_HEIGHT,
          isNested: true,
          state: child,
          width: NODE_WIDTH - 22,
          x: layerX + 28,
          y: y + NODE_HEIGHT + 56 + childIndex * (NODE_HEIGHT + 18),
        }))
        const nestedHeight =
          nestedChildren.length === 0
            ? 0
            : 56 +
              nestedChildren.length * NODE_HEIGHT +
              (nestedChildren.length - 1) * 18
        const blockHeight = NODE_HEIGHT + nestedHeight

        return {
          nodes: [...accumulator.nodes, parentNode, ...nestedNodes],
          nextY: y + blockHeight + VERTICAL_GAP,
        }
      },
      {
        nextY: TOP_PADDING,
        nodes: [] as Array<LayoutNode>,
      },
    ).nodes
  })

const buildNestedGroups = (layout: Array<LayoutNode>) =>
  layout.flatMap(node => {
    const nestedChildren = layout.filter(
      candidate => candidate.state.nestedParentState === node.state.name,
    )

    if (nestedChildren.length === 0) {
      return []
    }

    const bottom = Math.max(
      ...nestedChildren.map(child => child.y + child.height),
    )

    return [
      {
        height: bottom - node.y + 24,
        ...(node.state.nestedInitialState
          ? { initialChildName: node.state.nestedInitialState }
          : {}),
        parentName: node.state.name,
        width: node.width + 56,
        x: node.x - 14,
        y: node.y - 14,
      },
    ]
  })

const nodeCenterX = (node: LayoutNode): number => node.x + node.width / 2
const nodeCenterY = (node: LayoutNode): number => node.y + node.height / 2

const toEdgeSide = (dx: number, dy: number): EdgeSide => {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left"
  }

  return dy >= 0 ? "bottom" : "top"
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const toEdgeAttachmentPoint = (
  node: LayoutNode,
  side: EdgeSide,
  offset: number,
): { x: number; y: number } => {
  if (side === "right") {
    return {
      x: node.x + node.width,
      y: clamp(
        nodeCenterY(node) + offset,
        node.y + 10,
        node.y + node.height - 10,
      ),
    }
  }

  if (side === "left") {
    return {
      x: node.x,
      y: clamp(
        nodeCenterY(node) + offset,
        node.y + 10,
        node.y + node.height - 10,
      ),
    }
  }

  if (side === "bottom") {
    return {
      x: clamp(
        nodeCenterX(node) + offset,
        node.x + 12,
        node.x + node.width - 12,
      ),
      y: node.y + node.height,
    }
  }

  return {
    x: clamp(nodeCenterX(node) + offset, node.x + 12, node.x + node.width - 12),
    y: node.y,
  }
}

const computeQuadraticMidpoint = (
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
): { x: number; y: number } => ({
  x: startX * 0.25 + controlX * 0.5 + endX * 0.25,
  y: startY * 0.25 + controlY * 0.5 + endY * 0.25,
})

const buildTransitionSpecs = (
  layout: Array<LayoutNode>,
  nodeLookup: Map<string, LayoutNode>,
): Array<TransitionSpec> =>
  layout.flatMap(fromNode =>
    fromNode.state.transitions.flatMap(transition => {
      const toNode = nodeLookup.get(transition.target)

      return toNode ? [{ fromNode, toNode, transition }] : []
    }),
  )

const renderTransitionPath = (
  spec: TransitionSpec,
  renderIndex: number,
  routing: TransitionRouting,
): { labelX: number; labelY: number; path: string } => {
  const { fromNode, toNode } = spec

  if (fromNode.state.name === toNode.state.name) {
    const startX = fromNode.x + fromNode.width - 24
    const startY = fromNode.y + 12
    const endX = fromNode.x + fromNode.width / 2
    const endY = fromNode.y
    const controlX = fromNode.x + fromNode.width + 34
    const controlY = fromNode.y - 42

    const midpointX = (startX + endX) / 2
    const midpointY = controlY

    return {
      labelX: midpointX,
      labelY: midpointY,
      path: `M ${startX} ${startY} C ${controlX} ${controlY}, ${controlX} ${controlY}, ${endX} ${endY}`,
    }
  }

  const globalTransitionIndex = renderIndex
  const fromSide =
    routing.sourceSidesByIndex.get(globalTransitionIndex) ?? "right"
  const toSide = routing.targetSidesByIndex.get(globalTransitionIndex) ?? "left"
  const fromPoint = toEdgeAttachmentPoint(
    fromNode,
    fromSide,
    routing.sourceOffsetsByIndex.get(globalTransitionIndex) ?? 0,
  )
  const sourceOffset =
    routing.sourceOffsetsByIndex.get(globalTransitionIndex) ?? 0
  const toPoint = toEdgeAttachmentPoint(
    toNode,
    toSide,
    routing.targetOffsetsByIndex.get(globalTransitionIndex) ?? 0,
  )
  const targetOffset =
    routing.targetOffsetsByIndex.get(globalTransitionIndex) ?? 0
  const routeSpread = (sourceOffset - targetOffset) / 2
  const startX = fromPoint.x
  const startY = fromPoint.y
  const endX = toPoint.x
  const endY = toPoint.y
  const pairKey = `${fromNode.state.name}->${toNode.state.name}`
  const seenForPair = routing.pairSeenCount.get(pairKey) ?? 0
  const pairCount = routing.pairUsageCount.get(pairKey) ?? 1
  const laneOffset = seenForPair - (pairCount - 1) / 2
  const midpointX = (startX + endX) / 2
  const midpointY = (startY + endY) / 2
  const curveDirection = renderIndex % 2 === 0 ? 1 : -1
  const sameRow =
    Math.abs(nodeCenterY(fromNode) - nodeCenterY(toNode)) < VERTICAL_GAP * 0.35
  const longHop =
    sameRow &&
    Math.abs(nodeCenterX(fromNode) - nodeCenterX(toNode)) >
      NODE_WIDTH + HORIZONTAL_GAP * 1.05
  const curveStrength = sameRow
    ? CURVE_STRENGTH_SAME_ROW
    : CURVE_STRENGTH_DIAGONAL
  const controlX =
    midpointX +
    curveDirection * (CURVE_BASE + laneOffset * CURVE_LANE_MULTIPLIER) +
    routeSpread * CURVE_ROUTE_MULTIPLIER_X
  let controlY: number

  if (longHop) {
    controlY =
      nodeCenterX(toNode) >= nodeCenterX(fromNode)
        ? Math.min(startY, endY) - (LONG_HOP_ARC_UP + Math.abs(laneOffset) * 70)
        : Math.max(startY, endY) +
          (LONG_HOP_ARC_DOWN + Math.abs(laneOffset) * 70)
    controlY += routeSpread * CURVE_ROUTE_MULTIPLIER_Y
  } else {
    controlY =
      midpointY +
      curveDirection * (curveStrength + laneOffset * 38) +
      routeSpread * CURVE_ROUTE_MULTIPLIER_Y
  }

  const curveMidpoint = computeQuadraticMidpoint(
    startX,
    startY,
    controlX,
    controlY,
    endX,
    endY,
  )

  routing.pairSeenCount.set(pairKey, seenForPair + 1)

  return {
    labelX: curveMidpoint.x,
    labelY: curveMidpoint.y,
    path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
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
  } else if (node.isNested) {
    fill = "#f0fdf4"
    stroke = "#15803d"
  } else if (isEntry) {
    fill = "#ecfeff"
    stroke = "#0f766e"
  }

  const dash = isSpecial ? ' stroke-dasharray="8 6"' : ""
  let subtitle: string | undefined

  if (node.state.kind === "nested-parent") {
    subtitle = "Nested machine"
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

const renderNestedGroup = (group: NestedGroup): string =>
  [
    `
    <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="22" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="8 6" />`,
    `    <text x="${group.x + 18}" y="${group.y + 22}" class="panel-title">Nested machine: ${escapeSvg(group.parentName)}</text>`,
    group.initialChildName
      ? `    <text x="${group.x + 18}" y="${group.y + 42}" class="panel-row">Entry: ${escapeSvg(group.initialChildName)}</text>`
      : "",
  ].join("\n")

const renderNestedRelationship = (
  nodeLookup: Map<string, LayoutNode>,
  node: LayoutNode,
): string => {
  const childName = node.state.nestedInitialState

  if (!childName) {
    return ""
  }

  const childNode = nodeLookup.get(childName)

  if (!childNode) {
    return ""
  }

  const startX = nodeCenterX(node)
  const startY = node.y + node.height
  const endX = nodeCenterX(childNode)
  const endY = childNode.y

  return [
    `
    <path d="M ${startX} ${startY} L ${endX} ${endY}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-dasharray="6 5" />`,
    `    <text x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 8}" class="edge-label">contains</text>`,
  ].join("\n")
}

const renderTransition = (
  spec: TransitionSpec,
  renderIndex: number,
  routing: TransitionRouting,
): string => {
  const { transition } = spec
  const { labelX, labelY, path } = renderTransitionPath(
    spec,
    renderIndex,
    routing,
  )
  const stroke = transition.kind === "special" ? "#c2410c" : "#334155"
  const dash = transition.kind === "special" ? ' stroke-dasharray="7 5"' : ""
  const label = transition.note
    ? `${transition.action} (${transition.note})`
    : transition.action
  const labelWidth = Math.max(54, label.length * 7.6 + 14)
  const labelHeight = 18

  return [
    `
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.2" marker-end="url(#arrow)"${dash} />`,
    `    <rect x="${labelX - labelWidth / 2}" y="${labelY - labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="6" class="edge-label-bg" />`,
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
  const nestedGroups = buildNestedGroups(layout)
  const nodeLookup = new Map(layout.map(node => [node.state.name, node]))
  const transitions = buildTransitionSpecs(layout, nodeLookup)
  const transitionPorts = transitions.map(spec => {
    if (spec.fromNode.state.name === spec.toNode.state.name) {
      return { fromSide: undefined, toSide: undefined }
    }

    const dx = nodeCenterX(spec.toNode) - nodeCenterX(spec.fromNode)
    const dy = nodeCenterY(spec.toNode) - nodeCenterY(spec.fromNode)

    return {
      fromSide: toEdgeSide(dx, dy),
      toSide: toEdgeSide(-dx, -dy),
    }
  })
  const sourceOffsetsByIndex = new Map<number, number>()
  const targetOffsetsByIndex = new Map<number, number>()
  const sourceSidesByIndex = new Map<number, EdgeSide>()
  const targetSidesByIndex = new Map<number, EdgeSide>()
  const sourceGroups = transitions.reduce((map, _spec, transitionIndex) => {
    const fromSide = transitionPorts[transitionIndex]?.fromSide

    if (!fromSide) {
      return map
    }

    sourceSidesByIndex.set(transitionIndex, fromSide)

    const groupKey = `${transitions[transitionIndex]!.fromNode.state.name}:${fromSide}`
    const existing = map.get(groupKey) ?? []

    map.set(groupKey, [...existing, transitionIndex])

    return map
  }, new Map<string, number[]>())
  const targetGroups = transitions.reduce((map, _spec, transitionIndex) => {
    const toSide = transitionPorts[transitionIndex]?.toSide

    if (!toSide) {
      return map
    }

    targetSidesByIndex.set(transitionIndex, toSide)

    const groupKey = `${transitions[transitionIndex]!.toNode.state.name}:${toSide}`
    const existing = map.get(groupKey) ?? []

    map.set(groupKey, [...existing, transitionIndex])

    return map
  }, new Map<string, number[]>())

  sourceGroups.forEach(indices => {
    const sorted = [...indices].sort((left, right) => {
      const leftTo = transitions[left]!.toNode
      const rightTo = transitions[right]!.toNode

      return nodeCenterY(leftTo) - nodeCenterY(rightTo)
    })

    sorted.forEach((transitionIndex, rank) => {
      sourceOffsetsByIndex.set(
        transitionIndex,
        (rank - (sorted.length - 1) / 2) * PORT_LANE_STEP,
      )
    })
  })

  targetGroups.forEach(indices => {
    const sorted = [...indices].sort((left, right) => {
      const leftFrom = transitions[left]!.fromNode
      const rightFrom = transitions[right]!.fromNode

      return nodeCenterY(leftFrom) - nodeCenterY(rightFrom)
    })

    sorted.forEach((transitionIndex, rank) => {
      targetOffsetsByIndex.set(
        transitionIndex,
        (rank - (sorted.length - 1) / 2) * PORT_LANE_STEP,
      )
    })
  })
  const pairUsageCount = transitions.reduce((map, spec) => {
    const pairKey = `${spec.fromNode.state.name}->${spec.toNode.state.name}`

    map.set(pairKey, (map.get(pairKey) ?? 0) + 1)

    return map
  }, new Map<string, number>())
  const pairSeenCount = new Map<string, number>()
  const transitionRouting: TransitionRouting = {
    pairSeenCount,
    pairUsageCount,
    sourceOffsetsByIndex,
    sourceSidesByIndex,
    targetOffsetsByIndex,
    targetSidesByIndex,
  }
  const maxX = Math.max(
    720,
    ...layout.map(node => node.x + node.width + PADDING),
    ...nestedGroups.map(group => group.x + group.width + PADDING),
  )
  const maxY = Math.max(
    340,
    ...layout.map(node => node.y + node.height + 150),
    ...nestedGroups.map(group => group.y + group.height + 70),
  )
  const minX =
    Math.min(
      ...layout.map(node => node.x),
      ...nestedGroups.map(group => group.x),
      0,
    ) - SVG_VIEWPORT_MARGIN_X
  const minY =
    Math.min(
      ...layout.map(node => node.y),
      ...nestedGroups.map(group => group.y),
      0,
    ) - SVG_VIEWPORT_MARGIN_Y
  const width = maxX - minX + SVG_VIEWPORT_MARGIN_X
  const height = maxY - minY + SVG_VIEWPORT_MARGIN_Y

  return [
    `<svg width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">`,
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
    "      .edge-label { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #334155; text-anchor: middle; dominant-baseline: middle; }",
    "      .edge-label-bg { fill: rgba(255, 255, 255, 0.9); stroke: rgba(100, 116, 139, 0.42); stroke-width: 1; }",
    "      .panel-title { font: 700 13px ui-sans-serif, system-ui, sans-serif; fill: #0f172a; }",
    "      .panel-row { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #475569; }",
    "    </style>",
    "  </defs>",
    `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff" />`,
    `  <text x="${PADDING}" y="42" class="title">${escapeSvg(graph.name)}</text>`,
    `  <text x="${PADDING}" y="64" class="subtitle">Entry state: ${escapeSvg(graph.entryState)}</text>`,
    ...nestedGroups.map(group => renderNestedGroup(group)),
    ...layout.map(node => renderNestedRelationship(nodeLookup, node)),
    ...transitions.map((spec, transitionIndex) =>
      renderTransition(spec, transitionIndex, transitionRouting),
    ),
    ...layout.map(node => renderNode(graph, node)),
    renderOutputsPanel(graph, width, height),
    "</svg>",
    "",
  ].join("\n")
}
