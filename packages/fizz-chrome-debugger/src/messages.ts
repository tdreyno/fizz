import type { FizzDebuggerMessage } from "./bridge.js"

export type ContentToBackgroundMessage = {
  message: FizzDebuggerMessage
  type: "bridge-message"
}

export type PanelToBackgroundMessage = {
  tabId: number
  type: "subscribe"
}

export type BackgroundToPanelMessage =
  | {
      connected: boolean
      type: "connection-status"
    }
  | {
      message: FizzDebuggerMessage
      type: "bridge-message"
    }
