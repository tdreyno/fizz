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
  const timeline = snapshot.timeline.length
    ? snapshot.timeline
        .slice(-12)
        .map(entry => `${entry.type} @ ${entry.at}`)
        .join("\n")
    : "No events captured yet"

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
    createBlock("Recent Timeline", timeline),
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

  const list = document.createElement("div")
  const sortedRuntimes = [...state.runtimes.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  )

  list.className = "runtime-list"
  sortedRuntimes.map(renderRuntime).forEach(runtime => {
    list.append(runtime)
  })
  root.append(list)
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
