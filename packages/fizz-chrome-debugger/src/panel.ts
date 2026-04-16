import type {
  FizzDebuggerMessage,
  FizzDebuggerRuntimeSnapshot,
} from "@tdreyno/fizz-chrome-debugger"

import type {
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
} from "./messages.js"

type PanelState = {
  connected: boolean
  runtimes: Map<string, FizzDebuggerRuntimeSnapshot>
  selectedRuntimeId: string | null
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
  runtimes: new Map<string, FizzDebuggerRuntimeSnapshot>(),
  selectedRuntimeId: null,
}

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
  const card = document.createElement("section")
  const header = document.createElement("header")
  const title = document.createElement("h2")
  const subtitle = document.createElement("p")
  const grid = document.createElement("div")
  const formatScheduledItem = (kind: string, id: string, delay?: number) => {
    const delaySuffix = delay ? ` (${delay}ms)` : ""

    return `${kind}:${id}${delaySuffix}`
  }
  const scheduled = snapshot.scheduled.length
    ? snapshot.scheduled
        .map(item => formatScheduledItem(item.kind, item.id, item.delay))
        .join("\n")
    : "No active scheduled work"

  card.className = "runtime-card"
  title.textContent = snapshot.label
  subtitle.textContent = `${snapshot.runtimeId} • state ${snapshot.currentState.name}`
  header.append(title, subtitle)

  grid.className = "runtime-grid"
  grid.append(
    createBlock(
      "Current Data",
      JSON.stringify(snapshot.currentState.data, null, 2),
    ),
    createBlock("Scheduled Work", scheduled),
  )

  card.append(header, grid)

  return card
}

const render = (): void => {
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
      "Register a runtime with @tdreyno/fizz-chrome-debugger to populate this panel."
    root.append(empty)

    return
  }

  const sortedRuntimes = sortRuntimes(state.runtimes)
  const selectedRuntime = syncSelectedRuntime()

  root.append(renderTabs(sortedRuntimes))

  if (selectedRuntime) {
    root.append(renderRuntime(selectedRuntime))
  }
}

const applyBridgeMessage = (message: FizzDebuggerMessage): void => {
  if (message.kind === "runtime-disconnected") {
    state.runtimes.delete(message.runtimeId)
    render()
    return
  }

  state.runtimes.set(message.snapshot.runtimeId, message.snapshot)
  render()
}

port.onMessage.addListener((message: BackgroundToPanelMessage) => {
  if (message.type === "connection-status") {
    state.connected = message.connected

    if (!message.connected) {
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
