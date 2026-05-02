import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import { createEffectHandlerRegistry } from "./effectDispatcher.js"
import type { RuntimeDebugCommand } from "./runtimeContracts.js"

const BROWSER_EFFECT_LABELS = [
  "alert",
  "confirm",
  "copyToClipboard",
  "domAcquire",
  "domListen",
  "domObserveIntersection",
  "domObserveResize",
  "historyBack",
  "historyForward",
  "historyGo",
  "historyPushState",
  "historyReplaceState",
  "historySetScrollRestoration",
  "locationAssign",
  "locationReload",
  "locationReplace",
  "locationSetHash",
  "locationSetHost",
  "locationSetHostname",
  "locationSetHref",
  "locationSetPathname",
  "locationSetPort",
  "locationSetProtocol",
  "locationSetSearch",
  "openUrl",
  "postMessage",
  "printPage",
  "prompt",
] as const

const missingBrowserRuntimeMessage = (label: string): string =>
  `Fizz browser effect \`${label}\` was used, but browser runtime handlers are not registered. Import \`@tdreyno/fizz/browser\` in your app setup before creating the runtime.`

const buildBrowserGuardHandlers =
  (): RuntimeEffectHandlerRegistry<RuntimeDebugCommand> => {
    const handlers = createEffectHandlerRegistry<RuntimeDebugCommand, never>({})

    BROWSER_EFFECT_LABELS.forEach(label => {
      handlers.set(label, () => {
        throw new Error(missingBrowserRuntimeMessage(label))
      })
    })

    return handlers
  }

export const createRuntimeBrowserGuardModule = () => ({
  clear: () => void 0,
  clearForGoBack: () => void 0,
  clearForTransition: () => void 0,
  effectHandlers: buildBrowserGuardHandlers(),
})
