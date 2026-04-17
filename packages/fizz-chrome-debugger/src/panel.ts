import type {
  FizzDebuggerMessage,
  FizzDebuggerRuntimeSnapshot,
} from "./bridge.js"
import type {
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
} from "./messages.js"

type PanelState = {
  connected: boolean
  pausedRuntimeIds: Set<string>
  pausedSnapshots: Map<string, FizzDebuggerRuntimeSnapshot>
  runtimes: Map<string, FizzDebuggerRuntimeSnapshot>
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
  pausedRuntimeIds: new Set<string>(),
  pausedSnapshots: new Map<string, FizzDebuggerRuntimeSnapshot>(),
  runtimes: new Map<string, FizzDebuggerRuntimeSnapshot>(),
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
    createDataBlock("Current Data", visibleSnapshot.currentState.data),
    createBlock("Scheduled Work", scheduled),
    renderTimelineStack(visibleSnapshot, visibleSnapshot.runtimeId),
  )

  card.append(header, grid)

  return card
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
