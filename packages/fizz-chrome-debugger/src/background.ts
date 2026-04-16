import type {
  BackgroundToPanelMessage,
  ContentToBackgroundMessage,
  PanelToBackgroundMessage,
} from "./messages.js"

const panelPorts = new Map<number, Set<chrome.runtime.Port>>()
const pagePorts = new Map<number, chrome.runtime.Port>()

const broadcastConnectionStatus = (tabId: number): void => {
  const nextMessage: BackgroundToPanelMessage = {
    type: "connection-status",
    connected: pagePorts.has(tabId),
  }

  panelPorts.get(tabId)?.forEach(port => {
    port.postMessage(nextMessage)
  })
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name === "fizz-debugger-page") {
    const tabId = port.sender?.tab?.id

    if (tabId === undefined) {
      port.disconnect()
      return
    }

    pagePorts.set(tabId, port)
    broadcastConnectionStatus(tabId)

    port.onMessage.addListener((message: ContentToBackgroundMessage) => {
      panelPorts.get(tabId)?.forEach(panelPort => {
        panelPort.postMessage({
          type: "bridge-message",
          message: message.message,
        } satisfies BackgroundToPanelMessage)
      })
    })

    port.onDisconnect.addListener(() => {
      pagePorts.delete(tabId)
      broadcastConnectionStatus(tabId)
    })

    return
  }

  if (port.name !== "fizz-debugger-panel") {
    return
  }

  let subscribedTabId: number | undefined

  port.onMessage.addListener((message: PanelToBackgroundMessage) => {
    if (message.type !== "subscribe") {
      return
    }

    subscribedTabId = message.tabId
    const currentPorts =
      panelPorts.get(message.tabId) ?? new Set<chrome.runtime.Port>()

    panelPorts.set(message.tabId, currentPorts.add(port))
    broadcastConnectionStatus(message.tabId)
  })

  port.onDisconnect.addListener(() => {
    if (subscribedTabId === undefined) {
      return
    }

    const currentPorts = panelPorts.get(subscribedTabId)

    currentPorts?.delete(port)

    if (currentPorts?.size === 0) {
      panelPorts.delete(subscribedTabId)
    }
  })
})
