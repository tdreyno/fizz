import type { FizzDebuggerMessage } from "@tdreyno/fizz-chrome-debugger"

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
