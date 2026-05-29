import type { Action, Matcher, Runtime, WaitUntilOptions } from "@tdreyno/fizz"
import { matchState } from "@tdreyno/fizz"
import { useCallback, useEffect, useRef, useState } from "react"

type AnyRuntime = Runtime<any, any>

type AnyMatcher<T> = Parameters<AnyRuntime["waitUntilState"]>[0] | Matcher<T>

const isMatcher = <T>(value: AnyMatcher<T>): value is Matcher<T> =>
  typeof value === "object" &&
  value !== null &&
  "channels" in value &&
  "evalState" in value &&
  "evalOutput" in value

const toStateMatcher = <T>(matcher: AnyMatcher<T>): Matcher<T> => {
  if (isMatcher(matcher)) {
    return matcher
  }

  return matchState(matcher as never) as unknown as Matcher<T>
}

export type WaitUntilStatus = "pending" | "resolved" | "rejected"

export type WaitUntilResult<T> = {
  error: unknown
  status: WaitUntilStatus
  value: T | undefined
}

type HookOptions = Omit<WaitUntilOptions, "signal"> & {
  /**
   * Optional dependency array. When any value changes the wait is restarted.
   * The matcher and options reference are not compared automatically.
   */
  deps?: ReadonlyArray<unknown>
}

const initialPending = <T>(): WaitUntilResult<T> => ({
  error: undefined,
  status: "pending",
  value: undefined,
})

const useWaitUntilInternal = <T>(
  runtime: AnyRuntime,
  start: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): WaitUntilResult<T> => {
  const [result, setResult] = useState<WaitUntilResult<T>>(initialPending<T>)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setResult(initialPending<T>())

    start(controller.signal).then(
      value => {
        if (cancelled) {
          return
        }

        setResult({ error: undefined, status: "resolved", value })
      },
      error => {
        if (cancelled) {
          return
        }

        setResult({ error, status: "rejected", value: undefined })
      },
    )

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [runtime, ...deps])

  return result
}

export const useWaitUntilState = <T>(
  runtime: AnyRuntime,
  matcher: AnyMatcher<T>,
  options: HookOptions = {},
): WaitUntilResult<T> => {
  const matcherRef = useRef(matcher)
  matcherRef.current = matcher
  const optionsRef = useRef(options)
  optionsRef.current = options

  return useWaitUntilInternal<T>(
    runtime,
    signal =>
      runtime.waitUntil(toStateMatcher(matcherRef.current), {
        ...optionsRef.current,
        signal,
      }),
    options.deps ?? [],
  )
}

type OutputMatcherArg = Parameters<AnyRuntime["waitUntilOutput"]>[0]

export const useWaitUntilOutput = <T>(
  runtime: AnyRuntime,
  matcher: OutputMatcherArg | Matcher<T>,
  options: HookOptions = {},
): WaitUntilResult<T> => {
  const matcherRef = useRef(matcher)
  matcherRef.current = matcher
  const optionsRef = useRef(options)
  optionsRef.current = options

  return useWaitUntilInternal<T>(
    runtime,
    signal =>
      runtime.waitUntilOutput<T>(matcherRef.current as never, {
        ...optionsRef.current,
        signal,
      }),
    options.deps ?? [],
  )
}

export type UseRunUntilCallback = <T>(
  action: Action<string, unknown>,
  matcher: AnyMatcher<T>,
  options?: Omit<WaitUntilOptions, "signal">,
) => Promise<T>

export const useRunUntil = (runtime: AnyRuntime): UseRunUntilCallback => {
  const controllerRef = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  return useCallback(
    <T>(
      action: Action<string, unknown>,
      matcher: AnyMatcher<T>,
      options: Omit<WaitUntilOptions, "signal"> = {},
    ): Promise<T> => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      return runtime.runUntil(action, toStateMatcher(matcher), {
        ...options,
        signal: controller.signal,
      })
    },
    [runtime],
  )
}
