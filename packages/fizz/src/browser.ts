import type { RuntimeBrowserDriver } from "./runtime/browserDriver.js"

const assertBrowserMethod = <T>(
  methodName: string,
  method: T | undefined,
): T => {
  if (!method) {
    throw new Error(
      `Fizz browser driver expected globalThis.${methodName} to exist in this environment.`,
    )
  }

  return method
}

export type BrowserDriver = RuntimeBrowserDriver

export const browserDriver: BrowserDriver = {
  alert: message => {
    const alertMethod = assertBrowserMethod("alert", globalThis.alert)

    alertMethod(message)
  },
  confirm: message => {
    const confirmMethod = assertBrowserMethod("confirm", globalThis.confirm)

    return confirmMethod(message)
  },
  copyToClipboard: text => {
    const clipboard = globalThis.navigator?.clipboard

    if (!clipboard || typeof clipboard.writeText !== "function") {
      throw new Error(
        "Fizz browser driver expected globalThis.navigator.clipboard.writeText to exist in this environment.",
      )
    }

    return clipboard.writeText(text)
  },
  historyBack: () => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.back()
  },
  historyForward: () => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.forward()
  },
  historyGo: delta => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.go(delta)
  },
  locationAssign: url => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.assign(url)
  },
  locationReload: () => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.reload()
  },
  locationReplace: url => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.replace(url)
  },
  openUrl: (url, target, features) => {
    const openMethod = assertBrowserMethod("open", globalThis.open)

    openMethod(url, target, features)
  },
  postMessage: (message, targetOrigin, transfer) => {
    const postMessageMethod = assertBrowserMethod(
      "postMessage",
      globalThis.postMessage,
    )

    postMessageMethod(message, targetOrigin, transfer)
  },
  printPage: () => {
    const printMethod = assertBrowserMethod("print", globalThis.print)

    printMethod()
  },
  prompt: message => {
    const promptMethod = assertBrowserMethod("prompt", globalThis.prompt)

    return promptMethod(message)
  },
}
