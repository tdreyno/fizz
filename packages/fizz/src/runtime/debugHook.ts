import type { Runtime } from "../runtime.js"

export const FIZZ_CHROME_DEBUGGER_HOOK_KEY =
  "__FIZZ_CHROME_DEBUGGER_HOOK__" as const

export type RuntimeChromeDebuggerHookRegistration = {
  label?: string
  runtime: Runtime<any, any>
}

export type RuntimeChromeDebuggerHook = {
  registerRuntime: (
    registration: RuntimeChromeDebuggerHookRegistration,
  ) => void | (() => void)
}

const getRuntimeChromeDebuggerHook = () => {
  const hookTarget = globalThis as typeof globalThis & {
    [FIZZ_CHROME_DEBUGGER_HOOK_KEY]?: RuntimeChromeDebuggerHook
  }

  return hookTarget[FIZZ_CHROME_DEBUGGER_HOOK_KEY]
}

export const attachChromeDebuggerHook = (options: {
  label?: string
  runtime: Runtime<any, any>
}): (() => void) | undefined => {
  const hook = getRuntimeChromeDebuggerHook()

  if (!hook) {
    return undefined
  }

  const cleanup = hook.registerRuntime(
    options.label === undefined
      ? {
          runtime: options.runtime,
        }
      : {
          label: options.label,
          runtime: options.runtime,
        },
  )

  return cleanup ?? undefined
}
