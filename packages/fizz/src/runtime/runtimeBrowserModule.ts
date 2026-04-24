import {
  confirmAccepted,
  confirmRejected,
  promptCancelled,
  promptSubmitted,
} from "../action.js"
import type {
  AlertEffectData,
  ConfirmEffectData,
  CopyToClipboardEffectData,
  HistoryGoEffectData,
  LocationAssignEffectData,
  LocationReplaceEffectData,
  OpenUrlEffectData,
  PostMessageEffectData,
  PromptEffectData,
} from "../effect.js"
import type { RuntimeBrowserDriver } from "./browserDriver.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeState,
} from "./runtimeContracts.js"

export type RuntimeBrowserModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

export const createRuntimeBrowserModule = (options: {
  browserDriver?: RuntimeBrowserDriver
  runAction: (action: RuntimeAction) => Promise<void>
}): RuntimeBrowserModule => {
  const driver = options.browserDriver

  let hasPendingConfirm = false
  let hasPendingPrompt = false

  const assertDriverMethod = <T>(
    methodName: string,
    method: T | undefined,
  ): T => {
    if (!method) {
      throw new Error(
        `Fizz browser driver is missing \`${methodName}\` but the corresponding effect was used.`,
      )
    }

    return method
  }

  const runOneWay = (run: () => void | Promise<void>): void => {
    void Promise.resolve()
      .then(run)
      .catch(() => void 0)
  }

  const handleConfirm = (data: ConfirmEffectData): RuntimeDebugCommand[] => {
    if (hasPendingConfirm) {
      throw new Error(
        "Fizz received a second confirm request while one is pending",
      )
    }

    const confirmMethod = assertDriverMethod("confirm", driver?.confirm)

    hasPendingConfirm = true

    void Promise.resolve(confirmMethod(data.message))
      .then(result => {
        hasPendingConfirm = false

        const accepted = result === true || result === "accept"

        return options.runAction(
          accepted ? confirmAccepted() : confirmRejected(),
        )
      })
      .catch(() => {
        hasPendingConfirm = false

        return options.runAction(confirmRejected())
      })

    return []
  }

  const handlePrompt = (data: PromptEffectData): RuntimeDebugCommand[] => {
    if (hasPendingPrompt) {
      throw new Error(
        "Fizz received a second prompt request while one is pending",
      )
    }

    const promptMethod = assertDriverMethod("prompt", driver?.prompt)

    hasPendingPrompt = true

    void Promise.resolve(promptMethod(data.message))
      .then(value => {
        hasPendingPrompt = false

        return value === null
          ? options.runAction(promptCancelled())
          : options.runAction(promptSubmitted(value))
      })
      .catch(() => {
        hasPendingPrompt = false

        return options.runAction(promptCancelled())
      })

    return []
  }

  const clear = () => {
    if (hasPendingConfirm) {
      hasPendingConfirm = false
      void options.runAction(confirmRejected())
    }

    if (hasPendingPrompt) {
      hasPendingPrompt = false
      void options.runAction(promptCancelled())
    }
  }

  return {
    clear,
    clearForGoBack: clear,
    clearForTransition: () => {
      // Confirm/prompt are runtime-owned and remain active across normal transitions.
    },
    effectHandlers: new Map([
      ["confirm", item => handleConfirm(item.data as ConfirmEffectData)],
      ["prompt", item => handlePrompt(item.data as PromptEffectData)],
      [
        "alert",
        item => {
          const alertMethod = assertDriverMethod("alert", driver?.alert)

          runOneWay(() => alertMethod((item.data as AlertEffectData).message))

          return []
        },
      ],
      [
        "copyToClipboard",
        item => {
          const copyMethod = assertDriverMethod(
            "copyToClipboard",
            driver?.copyToClipboard,
          )

          runOneWay(() =>
            copyMethod((item.data as CopyToClipboardEffectData).text),
          )

          return []
        },
      ],
      [
        "openUrl",
        item => {
          const openMethod = assertDriverMethod("openUrl", driver?.openUrl)
          const data = item.data as OpenUrlEffectData

          runOneWay(() => openMethod(data.url, data.target, data.features))

          return []
        },
      ],
      [
        "printPage",
        () => {
          const printMethod = assertDriverMethod("printPage", driver?.printPage)

          runOneWay(() => printMethod())

          return []
        },
      ],
      [
        "locationAssign",
        item => {
          const locationAssignMethod = assertDriverMethod(
            "locationAssign",
            driver?.locationAssign,
          )

          runOneWay(() =>
            locationAssignMethod((item.data as LocationAssignEffectData).url),
          )

          return []
        },
      ],
      [
        "locationReplace",
        item => {
          const locationReplaceMethod = assertDriverMethod(
            "locationReplace",
            driver?.locationReplace,
          )

          runOneWay(() =>
            locationReplaceMethod((item.data as LocationReplaceEffectData).url),
          )

          return []
        },
      ],
      [
        "locationReload",
        () => {
          const locationReloadMethod = assertDriverMethod(
            "locationReload",
            driver?.locationReload,
          )

          runOneWay(() => locationReloadMethod())

          return []
        },
      ],
      [
        "historyBack",
        () => {
          const historyBackMethod = assertDriverMethod(
            "historyBack",
            driver?.historyBack,
          )

          runOneWay(() => historyBackMethod())

          return []
        },
      ],
      [
        "historyForward",
        () => {
          const historyForwardMethod = assertDriverMethod(
            "historyForward",
            driver?.historyForward,
          )

          runOneWay(() => historyForwardMethod())

          return []
        },
      ],
      [
        "historyGo",
        item => {
          const historyGoMethod = assertDriverMethod(
            "historyGo",
            driver?.historyGo,
          )

          runOneWay(() =>
            historyGoMethod((item.data as HistoryGoEffectData).delta),
          )

          return []
        },
      ],
      [
        "postMessage",
        item => {
          const postMessageMethod = assertDriverMethod(
            "postMessage",
            driver?.postMessage,
          )
          const data = item.data as PostMessageEffectData

          runOneWay(() =>
            postMessageMethod(data.message, data.targetOrigin, data.transfer),
          )

          return []
        },
      ],
    ]),
  }
}
