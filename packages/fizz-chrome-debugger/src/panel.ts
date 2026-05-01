import type {
  FizzDebuggerMachineGraph,
  FizzDebuggerMachineGraphNode,
  FizzDebuggerMachineGraphTransition,
  FizzDebuggerMessage,
  FizzDebuggerRuntimeSnapshot,
} from "./bridge.js"
import type {
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
} from "./messages.js"

type PanelState = {
  connected: boolean
  pulseTickIntervalId: ReturnType<typeof globalThis.setInterval> | null
  pausedRuntimeIds: Set<string>
  pausedSnapshots: Map<string, FizzDebuggerRuntimeSnapshot>
  runtimes: Map<string, FizzDebuggerRuntimeSnapshot>
  seenInternalActivityTypes: Map<string, Set<string>>
  selectedRuntimeId: string | null
  timelineAnchorIds: Map<string, string>
  timelineAnchorOffsets: Map<string, number>
  timelinePinnedToTop: Map<string, boolean>
  timelineScrollTops: Map<string, number>
  timelineEntryElements: Map<
    string,
    Map<string, { element: HTMLDivElement; signature: string }>
  >
  timelineFilters: Map<string, Set<string>>
  timelineSeenEventTypes: Map<string, Set<string>>
  expandedEntries: Map<string, boolean>
}

type TimelineEntryType = "action" | "error" | "output" | "transition" | "update"

type TimelineEntry = {
  at: number
  id: string
  payload: unknown
  subtitle?: string
  title: string
  type: TimelineEntryType
}

const root = document.querySelector<HTMLDivElement>("#app")

if (!root) {
  throw new Error("Missing #app root")
}

const params = new URLSearchParams(globalThis.location.search)
const rawTabId = params.get("tabId")
const tabId = rawTabId ? Number(rawTabId) : Number.NaN

const state: PanelState = {
  connected: false,
  pulseTickIntervalId: null,
  pausedRuntimeIds: new Set<string>(),
  pausedSnapshots: new Map<string, FizzDebuggerRuntimeSnapshot>(),
  runtimes: new Map<string, FizzDebuggerRuntimeSnapshot>(),
  seenInternalActivityTypes: new Map<string, Set<string>>(),
  selectedRuntimeId: null,
  timelineAnchorIds: new Map<string, string>(),
  timelineAnchorOffsets: new Map<string, number>(),
  timelinePinnedToTop: new Map<string, boolean>(),
  timelineScrollTops: new Map<string, number>(),
  timelineEntryElements: new Map<
    string,
    Map<string, { element: HTMLDivElement; signature: string }>
  >(),
  timelineFilters: new Map<string, Set<string>>(),
  timelineSeenEventTypes: new Map<string, Set<string>>(),
  expandedEntries: new Map<string, boolean>(),
}

const timelineTopSnapThresholdPx = 2

const stringifyForSignature = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return "[unserializable]"
  }
}

const getTimelineEntryCache = (
  runtimeId: string,
): Map<string, { element: HTMLDivElement; signature: string }> => {
  const existing = state.timelineEntryElements.get(runtimeId)

  if (existing) {
    return existing
  }

  const next = new Map<string, { element: HTMLDivElement; signature: string }>()

  state.timelineEntryElements.set(runtimeId, next)

  return next
}

const createTimelineEntrySignature = (
  entry: TimelineEntry,
  isExpanded: boolean,
): string =>
  [
    entry.id,
    entry.type,
    entry.title,
    entry.subtitle ?? "",
    isExpanded ? "expanded" : "collapsed",
    stringifyForSignature(entry.payload),
  ].join("|")

const port = chrome.runtime.connect({
  name: "fizz-debugger-panel",
})

const createBlock = (title: string, content: string): HTMLDivElement => {
  const block = document.createElement("div")
  const heading = document.createElement("h3")
  const pre = document.createElement("pre")

  block.className = "panel-block"
  heading.textContent = title
  pre.textContent = content
  block.append(heading, pre)

  return block
}

const sortRuntimes = (
  runtimes: Map<string, FizzDebuggerRuntimeSnapshot>,
): FizzDebuggerRuntimeSnapshot[] =>
  [...runtimes.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label) ||
      left.runtimeId.localeCompare(right.runtimeId),
  )

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null

const isSerializedUndefined = (value: unknown): boolean =>
  value === undefined || value === "[Undefined]"

const toMessage = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value
  }

  const record = asRecord(value)
  const message = record?.["message"]

  return typeof message === "string" ? message : undefined
}

const flattenData = (
  value: unknown,
  prefix = "",
): Array<{ key: string; value: unknown }> => {
  const record = asRecord(value)

  if (record === null || Array.isArray(value)) {
    return [{ key: prefix || "value", value }]
  }

  const entries = Object.entries(record)

  if (entries.length === 0) {
    return [{ key: prefix || "value", value }]
  }

  return entries.flatMap(([key, entryValue]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const nestedRecord = asRecord(entryValue)

    if (nestedRecord !== null && !Array.isArray(entryValue)) {
      return flattenData(entryValue, fullKey)
    }

    return [{ key: fullKey, value: entryValue }]
  })
}

const formatDataCellValue = (value: unknown): string => {
  if (isSerializedUndefined(value)) {
    return "undefined"
  }

  return JSON.stringify(value)
}

const createEmptyDetailMessage = (message: string): HTMLParagraphElement => {
  const paragraph = document.createElement("p")

  paragraph.className = "timeline-entry-empty-detail"
  paragraph.textContent = message

  return paragraph
}

const createDataTable = (data: unknown): HTMLTableElement => {
  const table = document.createElement("table")
  const body = document.createElement("tbody")
  const rows = flattenData(data)

  table.className = "data-table"

  rows.forEach(({ key, value }) => {
    const row = document.createElement("tr")
    const keyCell = document.createElement("th")
    const valueCell = document.createElement("td")

    keyCell.textContent = key
    valueCell.textContent = formatDataCellValue(value)

    row.append(keyCell, valueCell)
    body.append(row)
  })

  table.append(body)

  return table
}

const createUpdateDiffTable = (
  data: Record<string, { old: unknown; new: unknown }>,
): HTMLTableElement => {
  const table = document.createElement("table")
  const head = document.createElement("thead")
  const headRow = document.createElement("tr")
  const body = document.createElement("tbody")

  table.className = "data-table diff-table"
  ;["Field", "Previous", "Current"].forEach(label => {
    const headerCell = document.createElement("th")

    headerCell.textContent = label
    headRow.append(headerCell)
  })

  head.append(headRow)

  Object.entries(data).forEach(([key, value]) => {
    const row = document.createElement("tr")
    const keyCell = document.createElement("th")
    const oldValueCell = document.createElement("td")
    const newValueCell = document.createElement("td")

    keyCell.textContent = key
    oldValueCell.textContent = formatDataCellValue(value.old)
    newValueCell.textContent = formatDataCellValue(value.new)

    row.append(keyCell, oldValueCell, newValueCell)
    body.append(row)
  })

  table.append(head, body)

  return table
}

const createDataBlock = (title: string, data: unknown): HTMLDivElement => {
  const block = document.createElement("div")
  const heading = document.createElement("h3")

  block.className = "panel-block"
  heading.textContent = title
  block.append(heading, createDataTable(data))

  return block
}

type PositionedMachineGraphNode = FizzDebuggerMachineGraphNode & {
  cx: number
  cy: number
  height: number
  width: number
  x: number
  y: number
}

type EdgeSide = "bottom" | "left" | "right" | "top"

type InternalActivityItem = {
  key: string
  kind: "async" | "frame" | "interval" | "timer"
  label: string
}

const INTERNAL_ACTION_HIGHLIGHT_MS = 700
const EDGE_PULSE_TICK_MS = 80

const INTERNAL_ACTIVITY_ITEMS: InternalActivityItem[] = [
  { key: "async-started", kind: "async", label: "Async Started" },
  { key: "async-resolved", kind: "async", label: "Async Resolved" },
  { key: "async-rejected", kind: "async", label: "Async Rejected" },
  { key: "async-cancelled", kind: "async", label: "Async Cancelled" },
  { key: "timer-started", kind: "timer", label: "Timer Started" },
  { key: "timer-completed", kind: "timer", label: "Timer Completed" },
  { key: "timer-cancelled", kind: "timer", label: "Timer Cancelled" },
  {
    key: "interval-started",
    kind: "interval",
    label: "Interval Started",
  },
  {
    key: "interval-triggered",
    kind: "interval",
    label: "Interval Triggered",
  },
  {
    key: "interval-cancelled",
    kind: "interval",
    label: "Interval Cancelled",
  },
  { key: "frame-started", kind: "frame", label: "Frame Started" },
  { key: "frame-triggered", kind: "frame", label: "Frame Triggered" },
  { key: "frame-cancelled", kind: "frame", label: "Frame Cancelled" },
]

const SVG_NS = "http://www.w3.org/2000/svg"
const GRAPH_NODE_WIDTH = 170
const GRAPH_NODE_HEIGHT = 66
const GRAPH_NODE_PADDING_X = 42
const GRAPH_NODE_PADDING_Y = 44
const GRAPH_LAYER_GAP_X = 170
const GRAPH_LAYER_GAP_Y = 102
const GRAPH_VIEWPORT_MARGIN_X = 170
const GRAPH_VIEWPORT_MARGIN_Y = 210
const GRAPH_CURVE_BASE = 52
const GRAPH_CURVE_LANE_MULTIPLIER = 52
const GRAPH_CURVE_ROUTE_MULTIPLIER_X = 2.2
const GRAPH_CURVE_ROUTE_MULTIPLIER_Y = 8
const GRAPH_CURVE_STRENGTH_SAME_ROW = 150
const GRAPH_CURVE_STRENGTH_DIAGONAL = 100
const GRAPH_LONG_HOP_ARC_UP = 300
const GRAPH_LONG_HOP_ARC_DOWN = 320
const INTERNAL_ACTIVITY_EVENT_TYPES = new Set<string>(
  INTERNAL_ACTIVITY_ITEMS.map(item => item.key),
)

const createSvgElement = <T extends keyof SVGElementTagNameMap>(
  tag: T,
): SVGElementTagNameMap[T] => document.createElementNS(SVG_NS, tag)

const createEdgeLabelGroup = (
  labelText: string,
  x: number,
  y: number,
  isActive: boolean,
): SVGGElement => {
  const group = createSvgElement("g")
  const background = createSvgElement("rect")
  const text = createSvgElement("text")
  const width = Math.max(54, labelText.length * 7.6 + 14)
  const height = 18

  background.classList.add("machine-graph-edge-label-bg")
  background.setAttribute("x", String(x - width / 2))
  background.setAttribute("y", String(y - height / 2))
  background.setAttribute("width", String(width))
  background.setAttribute("height", String(height))
  background.setAttribute("rx", "6")

  text.classList.add("machine-graph-edge-label")
  text.setAttribute("x", String(x))
  text.setAttribute("y", String(y))
  text.textContent = labelText

  if (isActive) {
    text.classList.add("machine-graph-edge-label-active")
  }

  group.append(background, text)

  return group
}

const toInternalActivityType = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
): string | undefined => {
  const payload = asRecord(entry.payload)
  const type = payload?.["type"]

  if (typeof type !== "string") {
    return undefined
  }

  return INTERNAL_ACTIVITY_EVENT_TYPES.has(type) ? type : undefined
}

const toInternalActivityActiveByType = (
  snapshot: FizzDebuggerRuntimeSnapshot,
  seenTypes: Set<string>,
): Map<string, boolean> => {
  const now = Date.now()
  const latestTimestampByType = new Map<string, number>()

  snapshot.timeline.forEach(entry => {
    const type = toInternalActivityType(entry)

    if (!type) {
      return
    }

    latestTimestampByType.set(type, entry.at)
    seenTypes.add(type)
  })

  return INTERNAL_ACTIVITY_ITEMS.reduce((map, item) => {
    const at = latestTimestampByType.get(item.key)
    const isActive =
      at !== undefined && now - at <= INTERNAL_ACTION_HIGHLIGHT_MS

    map.set(item.key, isActive)

    return map
  }, new Map<string, boolean>())
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

const toEdgeSide = (dx: number, dy: number): EdgeSide => {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left"
  }

  return dy >= 0 ? "bottom" : "top"
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const toEdgeAttachmentPoint = (
  node: PositionedMachineGraphNode,
  side: EdgeSide,
  offset: number,
): { x: number; y: number } => {
  if (side === "right") {
    return {
      x: node.x + node.width,
      y: clamp(node.cy + offset, node.y + 10, node.y + node.height - 10),
    }
  }

  if (side === "left") {
    return {
      x: node.x,
      y: clamp(node.cy + offset, node.y + 10, node.y + node.height - 10),
    }
  }

  if (side === "bottom") {
    return {
      x: clamp(node.cx + offset, node.x + 12, node.x + node.width - 12),
      y: node.y + node.height,
    }
  }

  return {
    x: clamp(node.cx + offset, node.x + 12, node.x + node.width - 12),
    y: node.y,
  }
}

const toLayeredNodeLayers = (graph: FizzDebuggerMachineGraph): string[][] => {
  const nodeIds = graph.nodes.map(node => node.id)

  if (nodeIds.length <= 1) {
    return nodeIds.length === 0 ? [] : [[nodeIds[0]!]]
  }

  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()

  nodeIds.forEach(id => {
    outgoing.set(id, new Set<string>())
    incoming.set(id, new Set<string>())
  })

  graph.transitions.forEach(transition => {
    if (!outgoing.has(transition.from) || !incoming.has(transition.to)) {
      return
    }

    outgoing.get(transition.from)?.add(transition.to)
    incoming.get(transition.to)?.add(transition.from)
  })

  const indegree = new Map<string, number>(
    nodeIds.map(id => [id, incoming.get(id)?.size ?? 0]),
  )
  const starts = [
    ...(graph.entryState ? [graph.entryState] : []),
    ...nodeIds.filter(
      id => (indegree.get(id) ?? 0) === 0 && id !== graph.entryState,
    ),
  ]
  const queue = starts.length > 0 ? [...starts] : [nodeIds[0]!]
  const depth = new Map<string, number>()
  const visited = new Set<string>()

  queue.forEach(start => {
    if (!depth.has(start)) {
      depth.set(start, 0)
    }
  })

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || visited.has(current)) {
      continue
    }

    visited.add(current)
    const currentDepth = depth.get(current) ?? 0

    ;[...(outgoing.get(current) ?? new Set<string>())].forEach(next => {
      if (next === current) {
        return
      }

      const existingDepth = depth.get(next)

      if (existingDepth === undefined || existingDepth > currentDepth + 1) {
        depth.set(next, currentDepth + 1)
      }

      queue.push(next)
    })
  }

  let maxDepth = Math.max(0, ...depth.values())

  nodeIds.forEach(id => {
    if (depth.has(id)) {
      return
    }

    maxDepth += 1
    depth.set(id, maxDepth)
  })

  const layers = new Map<number, string[]>()

  nodeIds.forEach(id => {
    const nodeDepth = depth.get(id) ?? 0
    const existing = layers.get(nodeDepth) ?? []

    layers.set(nodeDepth, [...existing, id])
  })

  const sortedDepths = [...layers.keys()].sort((left, right) => left - right)
  const orderByNodeId = new Map<string, number>()

  sortedDepths.forEach(layerDepth => {
    const layerNodes = layers.get(layerDepth) ?? []

    if (layerDepth === 0) {
      const sorted = [...layerNodes].sort((left, right) =>
        left.localeCompare(right),
      )

      sorted.forEach((id, index) => {
        orderByNodeId.set(id, index)
      })
      layers.set(layerDepth, sorted)
      return
    }

    const sorted = [...layerNodes].sort((left, right) => {
      const leftParents = [...(incoming.get(left) ?? new Set<string>())]
      const rightParents = [...(incoming.get(right) ?? new Set<string>())]
      const leftScore =
        leftParents.length === 0
          ? Number.MAX_SAFE_INTEGER
          : leftParents.reduce(
              (sum, parentId) => sum + (orderByNodeId.get(parentId) ?? 0),
              0,
            ) / leftParents.length
      const rightScore =
        rightParents.length === 0
          ? Number.MAX_SAFE_INTEGER
          : rightParents.reduce(
              (sum, parentId) => sum + (orderByNodeId.get(parentId) ?? 0),
              0,
            ) / rightParents.length

      if (leftScore === rightScore) {
        return left.localeCompare(right)
      }

      return leftScore - rightScore
    })

    sorted.forEach((id, index) => {
      orderByNodeId.set(id, index)
    })
    layers.set(layerDepth, sorted)
  })

  return sortedDepths.map(layerDepth => layers.get(layerDepth) ?? [])
}

const toPositionedMachineGraphNodes = (
  graph: FizzDebuggerMachineGraph,
): PositionedMachineGraphNode[] => {
  const layers = toLayeredNodeLayers(graph)
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const positionedNodes = layers.flatMap((ids, depth) =>
    ids.map((id, index) => {
      const node = nodeById.get(id)

      if (!node) {
        return undefined
      }

      const x =
        GRAPH_NODE_PADDING_X + depth * (GRAPH_NODE_WIDTH + GRAPH_LAYER_GAP_X)
      const y =
        GRAPH_NODE_PADDING_Y + index * (GRAPH_NODE_HEIGHT + GRAPH_LAYER_GAP_Y)

      return {
        ...node,
        cx: x + GRAPH_NODE_WIDTH / 2,
        cy: y + GRAPH_NODE_HEIGHT / 2,
        height: GRAPH_NODE_HEIGHT,
        width: GRAPH_NODE_WIDTH,
        x,
        y,
      }
    }),
  )

  return positionedNodes.flatMap(node => (node ? [node] : []))
}

const getSnapshotActionPulses = (snapshot: FizzDebuggerRuntimeSnapshot) => {
  const pulsesFromSnapshot = snapshot.actionPulses

  if (pulsesFromSnapshot && pulsesFromSnapshot.length > 0) {
    return pulsesFromSnapshot
  }

  return snapshot.actionPulse ? [snapshot.actionPulse] : []
}

const resolveTransitionPulseStrengths = (
  snapshot: FizzDebuggerRuntimeSnapshot,
  transitions: FizzDebuggerMachineGraphTransition[],
) => {
  const pulses = getSnapshotActionPulses(snapshot)
  const durationMs = snapshot.actionPulseDurationMs
  const now = Date.now()
  const strengthByTransitionKey = new Map<string, number>()

  pulses.forEach(pulse => {
    const age = now - pulse.at

    if (age < 0 || age > durationMs) {
      return
    }

    const strength = Math.max(0, 1 - age / durationMs)
    const matchingTransitions = transitions.filter(transition => {
      if (transition.action !== pulse.actionType) {
        return false
      }

      if (pulse.fromState === undefined) {
        return true
      }

      return transition.from === pulse.fromState
    })
    const fallbackTransitions =
      matchingTransitions.length > 0
        ? matchingTransitions
        : transitions.filter(
            transition => transition.action === pulse.actionType,
          )

    fallbackTransitions.forEach(transition => {
      const key = `${transition.from}->${transition.to}:${transition.action}`
      const existingStrength = strengthByTransitionKey.get(key) ?? 0

      strengthByTransitionKey.set(key, Math.max(existingStrength, strength))
    })
  })

  return strengthByTransitionKey
}

const hasActiveEdgePulse = (snapshot: FizzDebuggerRuntimeSnapshot): boolean => {
  const durationMs = snapshot.actionPulseDurationMs
  const pulses = getSnapshotActionPulses(snapshot)
  const now = Date.now()

  return pulses.some(pulse => {
    const age = now - pulse.at

    return age >= 0 && age <= durationMs
  })
}

const applyEdgePulseStyle = (
  path: SVGPathElement,
  pulseStrength: number,
): boolean => {
  if (pulseStrength <= 0) {
    return false
  }

  path.classList.add("machine-graph-edge-active")
  path.style.setProperty(
    "--machine-edge-pulse-strength",
    pulseStrength.toFixed(3),
  )

  return true
}

const renderMachineGraphBlock = (
  snapshot: FizzDebuggerRuntimeSnapshot,
): HTMLDivElement => {
  const block = document.createElement("div")
  const heading = document.createElement("h3")
  const graph = snapshot.machineGraph

  block.className = "panel-block machine-graph-block"
  heading.textContent = "Machine Graph"
  block.append(heading)

  if (!graph) {
    const empty = document.createElement("p")

    empty.className = "machine-graph-empty"
    empty.textContent = "No graph metadata registered for this runtime yet."
    block.append(empty)

    return block
  }

  if (graph.nodes.length === 0) {
    const empty = document.createElement("p")

    empty.className = "machine-graph-empty"
    empty.textContent = "Graph metadata is present, but no nodes were provided."
    block.append(empty)

    return block
  }

  const canvas = document.createElement("div")
  const svg = createSvgElement("svg")
  const defs = createSvgElement("defs")
  const marker = createSvgElement("marker")
  const markerPath = createSvgElement("path")
  const legend = document.createElement("p")
  const seenInternalTypes =
    state.seenInternalActivityTypes.get(snapshot.runtimeId) ?? new Set<string>()
  const internalActivityActiveByType = toInternalActivityActiveByType(
    snapshot,
    seenInternalTypes,
  )
  const visibleInternalActivityItems = INTERNAL_ACTIVITY_ITEMS.filter(item =>
    seenInternalTypes.has(item.key),
  )

  state.seenInternalActivityTypes.set(snapshot.runtimeId, seenInternalTypes)
  const positionedNodes = toPositionedMachineGraphNodes(graph)
  const nodesById = new Map(positionedNodes.map(node => [node.id, node]))
  const transitionPorts = graph.transitions.map(transition => {
    const fromNode = nodesById.get(transition.from)
    const toNode = nodesById.get(transition.to)

    if (!fromNode || !toNode || fromNode.id === toNode.id) {
      return {
        fromSide: undefined,
        toSide: undefined,
      }
    }

    const dx = toNode.cx - fromNode.cx
    const dy = toNode.cy - fromNode.cy

    return {
      fromSide: toEdgeSide(dx, dy),
      toSide: toEdgeSide(-dx, -dy),
    }
  })
  const sourceOffsetsByIndex = new Map<number, number>()
  const targetOffsetsByIndex = new Map<number, number>()
  const sourceGroups = graph.transitions.reduce((map, _transition, index) => {
    const fromSide = transitionPorts[index]?.fromSide
    const fromNode = nodesById.get(graph.transitions[index]!.from)
    const toNode = nodesById.get(graph.transitions[index]!.to)

    if (!fromSide || !fromNode || !toNode) {
      return map
    }

    const groupKey = `${fromNode.id}:${fromSide}`
    const existing = map.get(groupKey) ?? []

    map.set(groupKey, [...existing, index])

    return map
  }, new Map<string, number[]>())
  const targetGroups = graph.transitions.reduce((map, _transition, index) => {
    const toSide = transitionPorts[index]?.toSide
    const fromNode = nodesById.get(graph.transitions[index]!.from)
    const toNode = nodesById.get(graph.transitions[index]!.to)

    if (!toSide || !fromNode || !toNode) {
      return map
    }

    const groupKey = `${toNode.id}:${toSide}`
    const existing = map.get(groupKey) ?? []

    map.set(groupKey, [...existing, index])

    return map
  }, new Map<string, number[]>())
  const portLaneStep = 52

  sourceGroups.forEach(indices => {
    const sorted = [...indices].sort((leftIndex, rightIndex) => {
      const leftTo = nodesById.get(graph.transitions[leftIndex]!.to)
      const rightTo = nodesById.get(graph.transitions[rightIndex]!.to)

      return (leftTo?.cy ?? 0) - (rightTo?.cy ?? 0)
    })

    sorted.forEach((transitionIndex, rank) => {
      sourceOffsetsByIndex.set(
        transitionIndex,
        (rank - (sorted.length - 1) / 2) * portLaneStep,
      )
    })
  })

  targetGroups.forEach(indices => {
    const sorted = [...indices].sort((leftIndex, rightIndex) => {
      const leftFrom = nodesById.get(graph.transitions[leftIndex]!.from)
      const rightFrom = nodesById.get(graph.transitions[rightIndex]!.from)

      return (leftFrom?.cy ?? 0) - (rightFrom?.cy ?? 0)
    })

    sorted.forEach((transitionIndex, rank) => {
      targetOffsetsByIndex.set(
        transitionIndex,
        (rank - (sorted.length - 1) / 2) * portLaneStep,
      )
    })
  })
  const pairUsageCount = graph.transitions.reduce((map, transition) => {
    const pairKey = `${transition.from}->${transition.to}`

    map.set(pairKey, (map.get(pairKey) ?? 0) + 1)

    return map
  }, new Map<string, number>())
  const pairSeenCount = new Map<string, number>()
  const pulseStrengthByTransitionKey = resolveTransitionPulseStrengths(
    snapshot,
    graph.transitions,
  )
  const contentMaxX =
    Math.max(...positionedNodes.map(node => node.x + node.width)) +
    GRAPH_VIEWPORT_MARGIN_X
  const contentMaxY =
    Math.max(...positionedNodes.map(node => node.y + node.height)) +
    GRAPH_VIEWPORT_MARGIN_Y
  const contentMinX =
    Math.min(...positionedNodes.map(node => node.x)) - GRAPH_VIEWPORT_MARGIN_X
  const contentMinY =
    Math.min(...positionedNodes.map(node => node.y)) - GRAPH_VIEWPORT_MARGIN_Y

  canvas.className = "machine-graph-canvas"
  svg.setAttribute(
    "viewBox",
    `${contentMinX} ${contentMinY} ${contentMaxX - contentMinX} ${contentMaxY - contentMinY}`,
  )
  svg.setAttribute("role", "img")
  svg.setAttribute(
    "aria-label",
    `Machine graph for ${graph.name} (current state ${snapshot.currentState.name})`,
  )

  marker.setAttribute("id", "machine-graph-arrowhead")
  marker.setAttribute("markerWidth", "10")
  marker.setAttribute("markerHeight", "10")
  marker.setAttribute("refX", "9")
  marker.setAttribute("refY", "5")
  marker.setAttribute("orient", "auto")
  markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z")
  markerPath.setAttribute("class", "machine-graph-arrow")
  marker.append(markerPath)
  defs.append(marker)
  svg.append(defs)

  graph.transitions.forEach((transition, index) => {
    const fromNode = nodesById.get(transition.from)
    const toNode = nodesById.get(transition.to)

    if (!fromNode || !toNode) {
      return
    }

    const path = createSvgElement("path")
    const key = `${transition.from}->${transition.to}:${transition.action}`
    const pairKey = `${transition.from}->${transition.to}`
    const seenForPair = pairSeenCount.get(pairKey) ?? 0
    const pairCount = pairUsageCount.get(pairKey) ?? 1
    const laneOffset = seenForPair - (pairCount - 1) / 2
    const pulseStrength = pulseStrengthByTransitionKey.get(key) ?? 0
    const isSelfTransition = fromNode.id === toNode.id

    pairSeenCount.set(pairKey, seenForPair + 1)

    path.classList.add("machine-graph-edge")

    if (transition.kind === "special") {
      path.classList.add("machine-graph-edge-special")
    }

    const isActive = applyEdgePulseStyle(path, pulseStrength)

    if (isSelfTransition) {
      const startX = fromNode.x + fromNode.width * 0.7
      const startY = fromNode.y + 8
      const endX = fromNode.x + fromNode.width * 0.35
      const endY = fromNode.y + 8
      const controlY = fromNode.y - (34 + Math.abs(laneOffset) * 18)
      const midpointX = (startX + endX) / 2
      const midpointY = controlY
      const labelGroup = createEdgeLabelGroup(
        transition.label ?? transition.action,
        midpointX,
        midpointY,
        isActive,
      )

      path.setAttribute(
        "d",
        `M ${startX} ${startY} C ${startX} ${controlY} ${endX} ${controlY} ${endX} ${endY}`,
      )
      path.setAttribute("marker-end", "url(#machine-graph-arrowhead)")
      svg.append(path, labelGroup)
    } else {
      const fromSide = transitionPorts[index]?.fromSide ?? "right"
      const toSide = transitionPorts[index]?.toSide ?? "left"
      const fromPoint = toEdgeAttachmentPoint(
        fromNode,
        fromSide,
        sourceOffsetsByIndex.get(index) ?? 0,
      )
      const sourceOffset = sourceOffsetsByIndex.get(index) ?? 0
      const toPoint = toEdgeAttachmentPoint(
        toNode,
        toSide,
        targetOffsetsByIndex.get(index) ?? 0,
      )
      const targetOffset = targetOffsetsByIndex.get(index) ?? 0
      const routeSpread = (sourceOffset - targetOffset) / 2
      const fromX = fromPoint.x
      const fromY = fromPoint.y
      const toX = toPoint.x
      const toY = toPoint.y
      const midpointX = (fromX + toX) / 2
      const midpointY = (fromY + toY) / 2
      const curveDirection = index % 2 === 0 ? 1 : -1
      const sameRow =
        Math.abs(fromNode.cy - toNode.cy) < GRAPH_LAYER_GAP_Y * 0.35
      const longHop =
        sameRow &&
        Math.abs(fromNode.cx - toNode.cx) >
          GRAPH_NODE_WIDTH + GRAPH_LAYER_GAP_X * 1.05
      const curveStrength = sameRow
        ? GRAPH_CURVE_STRENGTH_SAME_ROW
        : GRAPH_CURVE_STRENGTH_DIAGONAL
      const controlX =
        midpointX +
        curveDirection *
          (GRAPH_CURVE_BASE + laneOffset * GRAPH_CURVE_LANE_MULTIPLIER) +
        routeSpread * GRAPH_CURVE_ROUTE_MULTIPLIER_X
      let controlY: number

      if (longHop) {
        controlY =
          toNode.cx >= fromNode.cx
            ? Math.min(fromY, toY) -
              (GRAPH_LONG_HOP_ARC_UP + Math.abs(laneOffset) * 70)
            : Math.max(fromY, toY) +
              (GRAPH_LONG_HOP_ARC_DOWN + Math.abs(laneOffset) * 70)
        controlY += routeSpread * GRAPH_CURVE_ROUTE_MULTIPLIER_Y
      } else {
        controlY =
          midpointY +
          curveDirection * (curveStrength + laneOffset * 38) +
          routeSpread * GRAPH_CURVE_ROUTE_MULTIPLIER_Y
      }

      const curveMidpoint = computeQuadraticMidpoint(
        fromX,
        fromY,
        controlX,
        controlY,
        toX,
        toY,
      )
      const labelGroup = createEdgeLabelGroup(
        transition.label ?? transition.action,
        curveMidpoint.x,
        curveMidpoint.y,
        isActive,
      )

      path.setAttribute(
        "d",
        `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`,
      )
      path.setAttribute("marker-end", "url(#machine-graph-arrowhead)")
      svg.append(path, labelGroup)
    }
  })

  positionedNodes.forEach(node => {
    const group = createSvgElement("g")
    const rect = createSvgElement("rect")
    const text = createSvgElement("text")
    const caption = createSvgElement("text")
    const nodeLabel = node.label ?? node.id

    group.classList.add("machine-graph-node")

    if (node.kind === "special") {
      group.classList.add("machine-graph-node-special")
    }

    if (node.kind === "nested-parent") {
      group.classList.add("machine-graph-node-nested-parent")
    }

    if (node.kind === "nested-state") {
      group.classList.add("machine-graph-node-nested-state")
    }

    if (node.id === snapshot.currentState.name) {
      group.classList.add("machine-graph-node-active")
    }

    if (node.id === graph.entryState) {
      group.classList.add("machine-graph-node-entry")
    }

    rect.setAttribute("x", String(node.x))
    rect.setAttribute("y", String(node.y))
    rect.setAttribute("width", String(node.width))
    rect.setAttribute("height", String(node.height))
    rect.setAttribute("rx", "12")
    rect.setAttribute("ry", "12")
    rect.classList.add("machine-graph-node-shape")

    text.setAttribute("x", String(node.cx))
    text.setAttribute("y", String(node.y + node.height / 2 - 3))
    text.classList.add("machine-graph-node-label")
    text.textContent = nodeLabel

    caption.setAttribute("x", String(node.cx))
    caption.setAttribute("y", String(node.y + node.height / 2 + 14))
    caption.classList.add("machine-graph-node-caption")
    caption.textContent =
      node.id === graph.entryState ? "entry" : (node.kind ?? "state")

    group.append(rect, text, caption)
    svg.append(group)
  })

  legend.className = "machine-graph-legend"
  legend.textContent = `Current: ${snapshot.currentState.name}`

  const internalActivity = document.createElement("div")

  internalActivity.className = "machine-graph-internal"

  if (visibleInternalActivityItems.length === 0) {
    const empty = document.createElement("span")

    empty.className = "machine-graph-internal-empty"
    empty.textContent = "No internal actions observed yet"
    internalActivity.append(empty)
  }

  visibleInternalActivityItems.forEach(item => {
    const chip = document.createElement("span")

    chip.className = `machine-graph-internal-chip machine-graph-internal-chip-${item.kind}`

    if (internalActivityActiveByType.get(item.key) === true) {
      chip.classList.add("machine-graph-internal-chip-active")
    }

    chip.textContent = item.label
    internalActivity.append(chip)
  })

  canvas.append(svg)
  block.append(canvas, legend, internalActivity)

  return block
}

const toActionTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
  payload: Record<string, unknown>,
): TimelineEntry | undefined => {
  const action = asRecord(payload["action"])
  const actionType = action?.["type"]
  const currentState = asRecord(payload["currentState"])
  const currentStateName = currentState?.["name"]

  if (typeof actionType !== "string") {
    return undefined
  }

  return {
    at: entry.at,
    id: entry.id,
    payload: {
      action,
      currentState,
    },
    title:
      typeof currentStateName === "string"
        ? `${currentStateName} – ${actionType}`
        : actionType,
    type: "action",
  }
}

const resolvePreviousTransitionState = (
  previousName: string | undefined,
  currentName: string,
  historyItemCount: number,
): string => {
  if (typeof previousName === "string") {
    return previousName
  }

  if (historyItemCount <= 1) {
    return "none"
  }

  return currentName
}

const computeDataDiff = (
  oldData: unknown,
  newData: unknown,
): Record<string, { old: unknown; new: unknown }> => {
  const diff: Record<string, { old: unknown; new: unknown }> = {}

  const oldRecord = asRecord(oldData)
  const newRecord = asRecord(newData)

  if (!oldRecord || !newRecord) {
    return diff
  }

  const allKeys = new Set([
    ...Object.keys(oldRecord),
    ...Object.keys(newRecord),
  ])

  allKeys.forEach(key => {
    const oldValue = oldRecord[key]
    const newValue = newRecord[key]

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diff[key] = { old: oldValue, new: newValue }
    }
  })

  return diff
}

const toTransitionTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
  payload: Record<string, unknown>,
): TimelineEntry | undefined => {
  const context = asRecord(payload["context"])
  const contextCurrentState = asRecord(context?.["currentState"])
  const history = asRecord(context?.["history"])
  const historyItems = Array.isArray(history?.["items"]) ? history["items"] : []
  const historyCurrentState = asRecord(historyItems[0])
  const historyPreviousState = asRecord(historyItems[1])
  const currentState = asRecord(payload["currentState"])
  const previousState = asRecord(payload["previousState"])
  const resolvedCurrentName =
    currentState?.["name"] ??
    contextCurrentState?.["name"] ??
    historyCurrentState?.["name"]
  const resolvedPreviousName =
    previousState?.["name"] ?? historyPreviousState?.["name"]

  if (typeof resolvedCurrentName !== "string") {
    return undefined
  }

  const currentName = resolvedCurrentName
  const previousName =
    typeof resolvedPreviousName === "string" ? resolvedPreviousName : undefined

  const fromState = resolvePreviousTransitionState(
    previousName,
    currentName,
    historyItems.length,
  )

  // Detect same-state updates
  if (fromState === currentName) {
    const oldData = previousState?.["data"] ?? historyPreviousState?.["data"]
    const newData =
      currentState?.["data"] ??
      historyCurrentState?.["data"] ??
      contextCurrentState?.["data"]
    const diff = computeDataDiff(oldData, newData)
    const diffKeys = Object.keys(diff)

    if (diffKeys.length > 0) {
      return {
        at: entry.at,
        id: entry.id,
        payload: diff,
        title: `Data update in ${currentName}`,
        subtitle: diffKeys.join(", "),
        type: "update",
      }
    }

    // No data changes, skip this entry
    return undefined
  }

  return {
    at: entry.at,
    id: entry.id,
    payload: {
      fromState,
      toState: currentName,
      toStateData:
        currentState?.["data"] ??
        historyCurrentState?.["data"] ??
        contextCurrentState?.["data"],
    },
    title: `${fromState} -> ${currentName}`,
    type: "transition",
  }
}

const toOutputTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
  payload: Record<string, unknown>,
): TimelineEntry | undefined => {
  const output = asRecord(payload["output"])
  const outputType = output?.["type"]

  if (typeof outputType !== "string") {
    return undefined
  }

  return {
    at: entry.at,
    id: entry.id,
    payload: {
      output,
    },
    title: outputType,
    type: "output",
  }
}

const toRuntimeErrorTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
  payload: Record<string, unknown>,
): TimelineEntry => {
  const error = payload["error"]

  return {
    at: entry.at,
    id: entry.id,
    payload: {
      error,
    },
    title: "Runtime error",
    subtitle: toMessage(error) ?? "Runtime error",
    type: "error",
  }
}

const toAsyncRejectedTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
  payload: Record<string, unknown>,
): TimelineEntry => {
  const asyncId = payload["asyncId"]
  const error = payload["error"]
  const asyncLabel = typeof asyncId === "string" ? asyncId : "unknown"

  return {
    at: entry.at,
    id: entry.id,
    payload: {
      asyncId: asyncLabel,
      error,
    },
    title: `Async failed (${asyncLabel})`,
    subtitle: toMessage(error) ?? "Async error",
    type: "error",
  }
}

const toTimelineEntry = (
  entry: FizzDebuggerRuntimeSnapshot["timeline"][0],
): TimelineEntry | undefined => {
  const payload = asRecord(entry.payload)
  const eventType = payload?.["type"]

  if (payload === null || typeof eventType !== "string") {
    return undefined
  }

  switch (eventType) {
    case "action-enqueued": {
      return toActionTimelineEntry(entry, payload)
    }
    case "context-changed": {
      return toTransitionTimelineEntry(entry, payload)
    }
    case "output-emitted": {
      return toOutputTimelineEntry(entry, payload)
    }
    case "runtime-error": {
      return toRuntimeErrorTimelineEntry(entry, payload)
    }
    case "async-rejected": {
      return toAsyncRejectedTimelineEntry(entry, payload)
    }
    default: {
      return undefined
    }
  }
}

const toTimelineEntries = (
  timeline: FizzDebuggerRuntimeSnapshot["timeline"],
): TimelineEntry[] =>
  timeline.flatMap(entry => {
    const nextEntry = toTimelineEntry(entry)

    return nextEntry === undefined ? [] : [nextEntry]
  })

const getEventTypesFromTimeline = (timeline: TimelineEntry[]): string[] => {
  const types = new Set<string>()

  timeline.forEach(entry => {
    types.add(entry.type)
  })

  return [...types].sort((left, right) => left.localeCompare(right))
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  const ms = String(date.getMilliseconds()).padStart(3, "0")

  return `${hours}:${minutes}:${seconds}.${ms}`
}

const isRuntimePaused = (runtimeId: string): boolean =>
  state.pausedRuntimeIds.has(runtimeId)

const getTimelineScrollTop = (runtimeId: string): number =>
  state.timelineScrollTops.get(runtimeId) ?? 0

const getTimelineAnchorOffset = (runtimeId: string): number =>
  state.timelineAnchorOffsets.get(runtimeId) ?? 0

const captureTimelineAnchorFromStack = (
  runtimeId: string,
  stackContainer: HTMLDivElement,
): void => {
  const stackRect = stackContainer.getBoundingClientRect()
  const isPinnedToTop = stackContainer.scrollTop <= timelineTopSnapThresholdPx
  const entries = [
    ...stackContainer.querySelectorAll<HTMLDivElement>(".timeline-entry"),
  ]
  const expandedEntryInView = entries.find(entry => {
    const entryRect = entry.getBoundingClientRect()

    return (
      entry.classList.contains("timeline-entry-expanded") &&
      entryRect.bottom > stackRect.top &&
      entryRect.top < stackRect.bottom
    )
  })
  const anchorEntry =
    expandedEntryInView ??
    entries.find(
      entry => entry.getBoundingClientRect().bottom > stackRect.top,
    ) ??
    entries[0]

  state.timelineScrollTops.set(runtimeId, stackContainer.scrollTop)
  state.timelinePinnedToTop.set(runtimeId, isPinnedToTop)

  if (!anchorEntry?.dataset["entryId"]) {
    state.timelineAnchorIds.delete(runtimeId)
    state.timelineAnchorOffsets.delete(runtimeId)
    return
  }

  state.timelineAnchorIds.set(runtimeId, anchorEntry.dataset["entryId"])
  const anchorRect = anchorEntry.getBoundingClientRect()

  state.timelineAnchorOffsets.set(runtimeId, anchorRect.top - stackRect.top)
}

const captureTimelineAnchor = (runtimeId: string): void => {
  const existingStack = document.querySelector<HTMLDivElement>(
    `.timeline-stack[data-runtime-id="${runtimeId}"]`,
  )

  if (!existingStack) {
    return
  }

  captureTimelineAnchorFromStack(runtimeId, existingStack)
}

const restoreTimelineAnchor = (runtimeId: string): void => {
  const stackContainer = document.querySelector<HTMLDivElement>(
    `.timeline-stack[data-runtime-id="${runtimeId}"]`,
  )

  if (!stackContainer) {
    return
  }

  if (state.timelinePinnedToTop.get(runtimeId) === true) {
    stackContainer.scrollTop = 0
    state.timelineScrollTops.set(runtimeId, 0)
    return
  }

  const anchorId = state.timelineAnchorIds.get(runtimeId)

  if (anchorId) {
    const anchorEntry = [
      ...stackContainer.querySelectorAll<HTMLDivElement>(".timeline-entry"),
    ].find(entry => entry.dataset["entryId"] === anchorId)

    if (anchorEntry) {
      const stackRect = stackContainer.getBoundingClientRect()
      const anchorRect = anchorEntry.getBoundingClientRect()
      const desiredAnchorTop =
        stackRect.top + getTimelineAnchorOffset(runtimeId)
      const delta = anchorRect.top - desiredAnchorTop
      const maxScrollTop = Math.max(
        stackContainer.scrollHeight - stackContainer.clientHeight,
        0,
      )
      const nextScrollTop = Math.min(
        Math.max(stackContainer.scrollTop + delta, 0),
        maxScrollTop,
      )

      stackContainer.scrollTop = nextScrollTop
      state.timelineScrollTops.set(runtimeId, nextScrollTop)
      return
    }
  }

  stackContainer.scrollTop = getTimelineScrollTop(runtimeId)
}

const getPendingTimelineEntryCount = (
  liveTimeline: TimelineEntry[],
  visibleTimeline: TimelineEntry[],
): number => {
  return Math.max(liveTimeline.length - visibleTimeline.length, 0)
}

const parseTimelineCounter = (entryId: string): number | undefined => {
  const separatorIndex = entryId.lastIndexOf(":")

  if (separatorIndex < 0) {
    return undefined
  }

  const counter = Number(entryId.slice(separatorIndex + 1))

  return Number.isFinite(counter) ? counter : undefined
}

const hasDroppedTimelineEntries = (
  timeline: FizzDebuggerRuntimeSnapshot["timeline"],
): boolean => {
  const firstEntry = timeline[0]

  if (!firstEntry) {
    return false
  }

  const firstCounter = parseTimelineCounter(firstEntry.id)

  return typeof firstCounter === "number" && firstCounter > 1
}

const getVisibleSnapshot = (
  snapshot: FizzDebuggerRuntimeSnapshot,
): FizzDebuggerRuntimeSnapshot =>
  state.pausedSnapshots.get(snapshot.runtimeId) ?? snapshot

const renderTimelineEntry = (
  entry: TimelineEntry,
  isExpanded: boolean,
): HTMLDivElement => {
  const container = document.createElement("div")
  const header = document.createElement("div")
  const title = document.createElement("span")
  const timestamp = document.createElement("span")
  const subtitle = document.createElement("span")
  const details = document.createElement("div")

  container.className = `timeline-entry timeline-entry-${entry.type}`
  container.dataset["entryId"] = entry.id
  header.className = "timeline-entry-header"
  title.className = "timeline-entry-type"
  timestamp.className = "timeline-entry-time"
  subtitle.className = "timeline-entry-subtitle"

  title.textContent = entry.title
  timestamp.textContent = formatTimestamp(entry.at)
  subtitle.textContent = entry.subtitle ?? entry.type

  const entryPayload = asRecord(entry.payload)
  const action = entryPayload?.["action"]
  const actionPayload = asRecord(action)?.["payload"]
  const transitionToStateData = entryPayload?.["toStateData"]
  const hasActionPayload = !isSerializedUndefined(actionPayload)
  let detailData: unknown = entry.payload

  if (entry.type === "action" && action !== null) {
    detailData = hasActionPayload ? actionPayload : null
  }

  if (entry.type === "transition") {
    detailData = transitionToStateData
  }

  if (isExpanded) {
    container.classList.add("timeline-entry-expanded")
    details.className = "timeline-entry-details"

    if (entry.type === "update" && entryPayload !== null) {
      details.append(
        createUpdateDiffTable(
          entryPayload as Record<string, { old: unknown; new: unknown }>,
        ),
      )
    } else if (entry.type === "action" && !hasActionPayload) {
      details.append(createEmptyDetailMessage("No payload"))
    } else {
      details.append(createDataTable(detailData))
    }
  }

  header.append(title, subtitle, timestamp)
  container.append(header, ...(isExpanded ? [details] : []))

  header.addEventListener("click", () => {
    const currentExpanded = state.expandedEntries.get(entry.id) ?? false

    state.expandedEntries.set(entry.id, !currentExpanded)
    render()
  })

  return container
}

const getOrCreateTimelineEntryElement = (
  runtimeId: string,
  entry: TimelineEntry,
  isExpanded: boolean,
): HTMLDivElement => {
  const cache = getTimelineEntryCache(runtimeId)
  const signature = createTimelineEntrySignature(entry, isExpanded)
  const cached = cache.get(entry.id)

  if (cached?.signature === signature) {
    return cached.element
  }

  const element = renderTimelineEntry(entry, isExpanded)

  cache.set(entry.id, {
    element,
    signature,
  })

  return element
}

const renderTimelineStack = (
  snapshot: FizzDebuggerRuntimeSnapshot,
  runtimeId: string,
): HTMLDivElement => {
  const block = document.createElement("div")
  const heading = document.createElement("h3")
  const controls = document.createElement("div")
  const filterLabel = document.createElement("span")
  const filterContainer = document.createElement("div")
  const pendingCount = document.createElement("span")
  const timelineWindowInfo = document.createElement("span")
  const clearButton = document.createElement("button")
  const pauseButton = document.createElement("button")
  const stackContainer = document.createElement("div")
  const liveSnapshot = state.runtimes.get(runtimeId) ?? snapshot
  const timelineEntries = toTimelineEntries(snapshot.timeline)
  const liveTimelineEntries = toTimelineEntries(liveSnapshot.timeline)
  const isPaused = isRuntimePaused(runtimeId)
  const pendingEntryCount = getPendingTimelineEntryCount(
    liveTimelineEntries,
    timelineEntries,
  )

  block.className = "panel-block timeline-block"
  controls.className = "timeline-controls"
  filterContainer.className = "timeline-filters"
  clearButton.className = "timeline-clear-btn"
  pauseButton.className = "timeline-pause-btn"
  stackContainer.className = "timeline-stack"
  stackContainer.dataset["runtimeId"] = runtimeId

  heading.textContent = "Timeline"
  filterLabel.textContent = "Filter:"
  filterLabel.className = "timeline-filter-label"
  pendingCount.className = "timeline-pending-count"
  timelineWindowInfo.className = "timeline-window-info"
  clearButton.textContent = "Clear"
  clearButton.type = "button"
  pauseButton.textContent = isPaused ? "Resume" : "Pause"
  pauseButton.type = "button"

  if (isPaused) {
    pauseButton.classList.add("timeline-pause-btn-active")
  }

  if (isPaused && pendingEntryCount > 0) {
    pendingCount.textContent = `${pendingEntryCount} new`
  } else {
    pendingCount.hidden = true
  }

  if (hasDroppedTimelineEntries(snapshot.timeline)) {
    timelineWindowInfo.textContent = "Showing latest entries"
  } else {
    timelineWindowInfo.hidden = true
  }

  const eventTypes = getEventTypesFromTimeline(timelineEntries)
  const storedFilters = state.timelineFilters.get(runtimeId)
  const seenEventTypes =
    state.timelineSeenEventTypes.get(runtimeId) ?? new Set<string>()
  const currentFilters =
    storedFilters === undefined
      ? new Set<string>(eventTypes)
      : new Set<string>(
          [...storedFilters].filter(type => eventTypes.includes(type)),
        )

  eventTypes.forEach(type => {
    if (seenEventTypes.has(type)) {
      return
    }

    seenEventTypes.add(type)
    currentFilters.add(type)
  })

  if (currentFilters.size === 0 && eventTypes.length > 0) {
    eventTypes.forEach(type => {
      currentFilters.add(type)
    })
  }

  state.timelineSeenEventTypes.set(runtimeId, seenEventTypes)
  state.timelineFilters.set(runtimeId, currentFilters)

  eventTypes.forEach(type => {
    const label = document.createElement("label")
    const checkbox = document.createElement("input")

    label.className = "timeline-filter-item"
    checkbox.type = "checkbox"
    checkbox.checked = currentFilters.has(type)
    checkbox.value = type

    checkbox.addEventListener("change", () => {
      const filters = state.timelineFilters.get(runtimeId) ?? new Set<string>()

      if (checkbox.checked) {
        filters.add(type)
      } else {
        filters.delete(type)
      }

      state.timelineFilters.set(runtimeId, filters)
      render()
    })

    label.append(checkbox)
    const text = document.createElement("span")
    text.textContent = type
    label.append(text)
    filterContainer.append(label)
  })

  clearButton.addEventListener("click", () => {
    const runtime = state.runtimes.get(runtimeId)
    const pausedSnapshot = state.pausedSnapshots.get(runtimeId)

    if (runtime) {
      runtime.timeline = []
    }

    if (pausedSnapshot) {
      pausedSnapshot.timeline = []
    }

    render()
  })

  pauseButton.addEventListener("click", () => {
    if (isRuntimePaused(runtimeId)) {
      state.pausedRuntimeIds.delete(runtimeId)
      state.pausedSnapshots.delete(runtimeId)
      render()
      return
    }

    state.pausedRuntimeIds.add(runtimeId)
    state.pausedSnapshots.set(runtimeId, liveSnapshot)
    render()
  })

  const filteredTimeline = timelineEntries.filter(entry =>
    currentFilters.has(entry.type),
  )

  const sortedEntries = [...filteredTimeline].reverse()
  const currentEntryIds = new Set<string>(sortedEntries.map(entry => entry.id))
  const cache = getTimelineEntryCache(runtimeId)

  cache.forEach((_, entryId) => {
    if (!currentEntryIds.has(entryId)) {
      cache.delete(entryId)
    }
  })

  sortedEntries.forEach(entry => {
    const isExpanded = state.expandedEntries.get(entry.id) ?? false
    const entryEl = getOrCreateTimelineEntryElement(
      runtimeId,
      entry,
      isExpanded,
    )

    stackContainer.append(entryEl)
  })

  stackContainer.addEventListener("scroll", () => {
    captureTimelineAnchorFromStack(runtimeId, stackContainer)
  })

  if (filteredTimeline.length === 0) {
    const empty = document.createElement("p")

    empty.className = "timeline-empty"
    empty.textContent = "No timeline entries"
    stackContainer.append(empty)
  }

  controls.append(
    filterLabel,
    filterContainer,
    pendingCount,
    timelineWindowInfo,
    pauseButton,
    clearButton,
  )
  block.append(heading, controls, stackContainer)

  return block
}

const syncSelectedRuntime = (): FizzDebuggerRuntimeSnapshot | null => {
  const sortedRuntimes = sortRuntimes(state.runtimes)

  if (sortedRuntimes.length === 0) {
    state.selectedRuntimeId = null

    return null
  }

  const selectedRuntime = state.selectedRuntimeId
    ? (state.runtimes.get(state.selectedRuntimeId) ?? null)
    : null

  if (selectedRuntime) {
    return selectedRuntime
  }

  const nextSelectedRuntime = sortedRuntimes[0] ?? null

  state.selectedRuntimeId = nextSelectedRuntime?.runtimeId ?? null

  return nextSelectedRuntime
}

const renderTabs = (
  runtimes: FizzDebuggerRuntimeSnapshot[],
): HTMLDivElement => {
  const tabs = document.createElement("div")

  tabs.className = "runtime-tabs"

  runtimes.forEach(runtime => {
    const button = document.createElement("button")

    button.className = "runtime-tab"

    if (runtime.runtimeId === state.selectedRuntimeId) {
      button.classList.add("runtime-tab-active")
    }

    button.textContent = runtime.label
    button.type = "button"
    button.addEventListener("click", () => {
      state.selectedRuntimeId = runtime.runtimeId
      render()
    })
    tabs.append(button)
  })

  return tabs
}

const renderRuntime = (snapshot: FizzDebuggerRuntimeSnapshot): HTMLElement => {
  const visibleSnapshot = getVisibleSnapshot(snapshot)
  const card = document.createElement("section")
  const header = document.createElement("header")
  const title = document.createElement("h2")
  const subtitle = document.createElement("p")
  const grid = document.createElement("div")
  const subtitleParts = [
    visibleSnapshot.runtimeId,
    `state ${visibleSnapshot.currentState.name}`,
  ]
  const formatScheduledItem = (kind: string, id: string, delay?: number) => {
    const delaySuffix = delay ? ` (${delay}ms)` : ""

    return `${kind}:${id}${delaySuffix}`
  }
  const scheduled = visibleSnapshot.scheduled.length
    ? visibleSnapshot.scheduled
        .map(item => formatScheduledItem(item.kind, item.id, item.delay))
        .join("\n")
    : "No active scheduled work"

  card.className = "runtime-card"
  title.textContent = visibleSnapshot.label

  if (isRuntimePaused(visibleSnapshot.runtimeId)) {
    subtitleParts.push("paused")
  }

  subtitle.textContent = subtitleParts.join(" • ")
  header.append(title, subtitle)

  grid.className = "runtime-grid"
  grid.append(
    renderMachineGraphBlock(visibleSnapshot),
    createDataBlock("Current Data", visibleSnapshot.currentState.data),
    createBlock("Scheduled Work", scheduled),
    renderTimelineStack(visibleSnapshot, visibleSnapshot.runtimeId),
  )

  card.append(header, grid)

  return card
}

const ensurePulseTick = (): void => {
  if (state.pulseTickIntervalId !== null) {
    return
  }

  state.pulseTickIntervalId = globalThis.setInterval(() => {
    if ([...state.runtimes.values()].some(hasActiveEdgePulse)) {
      render()
      return
    }

    if (state.pulseTickIntervalId !== null) {
      globalThis.clearInterval(state.pulseTickIntervalId)
      state.pulseTickIntervalId = null
    }
  }, EDGE_PULSE_TICK_MS)
}

const render = (): void => {
  if (state.selectedRuntimeId !== null) {
    captureTimelineAnchor(state.selectedRuntimeId)
  }

  root.replaceChildren()

  const status = document.createElement("section")
  const statusLabel = document.createElement("strong")
  const statusText = document.createElement("span")

  status.className = "status"
  statusLabel.textContent = state.connected ? "Connected" : "Waiting"
  statusText.textContent = state.connected
    ? " Listening for Fizz runtime updates on this tab."
    : " No Fizz bridge messages detected on this tab yet."

  status.append(statusLabel, statusText)
  root.append(status)

  if (state.runtimes.size === 0) {
    const empty = document.createElement("p")

    empty.className = "empty"
    empty.textContent =
      "Register a runtime with @repo/fizz-chrome-debugger to populate this panel."
    root.append(empty)

    return
  }

  const sortedRuntimes = sortRuntimes(state.runtimes)
  const selectedRuntime = syncSelectedRuntime()

  root.append(renderTabs(sortedRuntimes))

  if (selectedRuntime) {
    root.append(renderRuntime(selectedRuntime))
    restoreTimelineAnchor(selectedRuntime.runtimeId)
  }

  if ([...state.runtimes.values()].some(hasActiveEdgePulse)) {
    ensurePulseTick()
    return
  }

  if (state.pulseTickIntervalId !== null) {
    globalThis.clearInterval(state.pulseTickIntervalId)
    state.pulseTickIntervalId = null
  }
}

const applyBridgeMessage = (message: FizzDebuggerMessage): void => {
  if (message.kind === "runtime-disconnected") {
    state.pausedRuntimeIds.delete(message.runtimeId)
    state.pausedSnapshots.delete(message.runtimeId)
    state.timelineAnchorIds.delete(message.runtimeId)
    state.timelineAnchorOffsets.delete(message.runtimeId)
    state.timelinePinnedToTop.delete(message.runtimeId)
    state.timelineScrollTops.delete(message.runtimeId)
    state.timelineEntryElements.delete(message.runtimeId)
    state.timelineFilters.delete(message.runtimeId)
    state.timelineSeenEventTypes.delete(message.runtimeId)
    state.seenInternalActivityTypes.delete(message.runtimeId)
    state.runtimes.delete(message.runtimeId)
    render()
    return
  }

  const runtimeId = message.snapshot.runtimeId
  const wasKnownRuntime = state.runtimes.has(runtimeId)
  const isPausedRuntime = isRuntimePaused(runtimeId)
  const shouldRender =
    state.selectedRuntimeId === null ||
    state.selectedRuntimeId === runtimeId ||
    !wasKnownRuntime

  state.runtimes.set(runtimeId, message.snapshot)

  // Keep the paused timeline visually stable while updates keep arriving.
  if (message.kind === "runtime-updated" && isPausedRuntime) {
    return
  }

  if (shouldRender) {
    render()
  }
}

port.onMessage.addListener((message: BackgroundToPanelMessage) => {
  if (message.type === "connection-status") {
    state.connected = message.connected

    if (!message.connected) {
      state.pausedRuntimeIds.clear()
      state.pausedSnapshots.clear()
      state.timelineAnchorIds.clear()
      state.timelineAnchorOffsets.clear()
      state.timelinePinnedToTop.clear()
      state.timelineScrollTops.clear()
      state.timelineEntryElements.clear()
      state.timelineFilters.clear()
      state.timelineSeenEventTypes.clear()
      state.seenInternalActivityTypes.clear()
      state.runtimes.clear()
      state.selectedRuntimeId = null
    }

    render()
    return
  }

  applyBridgeMessage(message.message)
})

const subscribeMessage: PanelToBackgroundMessage = {
  type: "subscribe",
  tabId,
}

port.postMessage(subscribeMessage)
render()
