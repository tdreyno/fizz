import type { FizzDebuggerMessage } from "./bridge.js"
import { FIZZ_CHROME_DEBUGGER_EVENT_NAME } from "./bridge.js"
import type { ContentToBackgroundMessage } from "./messages.js"

const injectChromeDebuggerHook = () => {
  const script = document.createElement("script")

  script.src = chrome.runtime.getURL("inject.js")
  script.type = "module"
  script.dataset["fizzChromeDebugger"] = "true"
  script.onload = () => {
    script.remove()
  }
  ;(document.head ?? document.documentElement).append(script)
}

injectChromeDebuggerHook()

const port = chrome.runtime.connect({
  name: "fizz-debugger-page",
})

globalThis.addEventListener(FIZZ_CHROME_DEBUGGER_EVENT_NAME, event => {
  const nextMessage: ContentToBackgroundMessage = {
    type: "bridge-message",
    message: (event as CustomEvent<FizzDebuggerMessage>).detail,
  }

  port.postMessage(nextMessage)
})
