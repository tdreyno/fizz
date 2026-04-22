import type { Action } from "./action.js"
import { enter } from "./action.js"
import type { Context, History } from "./context.js"
import { createInitialContext } from "./context.js"
import type {
  ControlledAsyncDriver,
  ControlledTimerDriver,
  Runtime,
} from "./runtime.js"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  Runtime as FizzRuntime,
} from "./runtime.js"
import type { StateTransition } from "./state.js"

type TestActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

type Logger = (
  msgs: readonly unknown[],
  level: "error" | "warn" | "log",
) => void

type HarnessState = StateTransition<string, any, any>
type HarnessInternalAction<AM extends TestActionMap> = ReturnType<AM[keyof AM]>
type HarnessRunAction<AM extends TestActionMap> =
  | HarnessInternalAction<AM>
  | Action<string, unknown>

type HarnessOutputAction<OAM extends TestActionMap> = ReturnType<OAM[keyof OAM]>

export type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

export type TestStateSnapshot<State extends HarnessState> = {
  currentState: State
  history: Array<State>
}

export type SettleOptions = {
  maxIterations?: number
}

export type WaitForStateOptions = SettleOptions & {
  settleBetweenChecks?: boolean
}

export type WaitForOutputOptions = SettleOptions & {
  settleBetweenChecks?: boolean
}

export type TestHarnessOptions<
  State extends HarnessState,
  AM extends TestActionMap,
  OAM extends TestActionMap,
> = {
  history: Array<State>
  internalActions?: AM
  outputActions?: OAM
  maxHistory?: number
  enableLogging?: boolean
  customLogger?: Logger
  recordStates?: boolean
  recordOutputs?: boolean
  asyncDriver?: ControlledAsyncDriver
  timerDriver?: ControlledTimerDriver
}

export type TestHarness<
  State extends HarnessState,
  AM extends TestActionMap,
  OAM extends TestActionMap,
> = {
  context: Context
  runtime: Runtime<AM, OAM>
  asyncDriver: ControlledAsyncDriver
  timerDriver: ControlledTimerDriver
  start: () => Promise<void>
  run: (action: HarnessRunAction<AM>) => Promise<void>
  respondToOutput: <
    OA extends ReturnType<OAM[keyof OAM]>,
    T extends OA["type"],
    A extends HarnessInternalAction<AM>,
  >(
    type: T,
    handler: (
      payload: Extract<OA, { type: T }>["payload"],
    ) => Promise<A> | A | void,
  ) => () => void
  currentState: () => State
  currentHistory: () => History<State>
  states: () => Array<TestStateSnapshot<State>>
  outputs: () => Array<HarnessOutputAction<OAM>>
  lastState: () => TestStateSnapshot<State> | undefined
  lastOutput: () => HarnessOutputAction<OAM> | undefined
  flushAsync: () => Promise<void>
  runAllAsync: () => Promise<void>
  advanceBy: (ms: number) => Promise<void>
  advanceFrames: (count: number, frameMs?: number) => Promise<void>
  runAllTimers: () => Promise<void>
  settle: (options?: SettleOptions) => Promise<void>
  waitForState: (
    predicate: (state: State) => boolean,
    options?: WaitForStateOptions,
  ) => Promise<State>
  waitForOutput: (
    typeOrPredicate:
      | HarnessOutputAction<OAM>["type"]
      | ((output: HarnessOutputAction<OAM>) => boolean),
    options?: WaitForOutputOptions,
  ) => Promise<HarnessOutputAction<OAM>>
  clearRecords: () => void
  disconnect: () => void
}

export const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

const createStateSnapshot = <State extends HarnessState>(
  context: Context,
): TestStateSnapshot<State> => ({
  currentState: context.currentState as State,
  history: context.history.toArray().slice() as Array<State>,
})

const lastItem = <T>(values: Array<T>): T | undefined => {
  if (values.length === 0) {
    return undefined
  }

  return values.at(-1)
}

const DEFAULT_MAX_ITERATIONS = 100

const resolveMaxIterations = (value?: number): number => {
  if (value === undefined) {
    return DEFAULT_MAX_ITERATIONS
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Expected maxIterations to be an integer >= 1, received ${String(value)}`,
    )
  }

  return value
}

export const createTestHarness = <
  State extends HarnessState,
  AM extends TestActionMap = Record<string, never>,
  OAM extends TestActionMap = Record<string, never>,
>(
  options: TestHarnessOptions<State, AM, OAM>,
): TestHarness<State, AM, OAM> => {
  const asyncDriver = options.asyncDriver ?? createControlledAsyncDriver()
  const timerDriver = options.timerDriver ?? createControlledTimerDriver()
  const context = createInitialContext(options.history, {
    customLogger: options.customLogger,
    enableLogging: options.enableLogging ?? false,
    maxHistory: options.maxHistory ?? Infinity,
  })
  const runtime = new FizzRuntime(
    context,
    (options.internalActions ?? {}) as AM,
    (options.outputActions ?? {}) as OAM,
    { asyncDriver, timerDriver },
  )
  const recordedStates: Array<TestStateSnapshot<State>> =
    options.recordStates === false ? [] : [createStateSnapshot<State>(context)]
  const recordedOutputs: Array<HarnessOutputAction<OAM>> = []
  const unsubscribers = [
    options.recordStates === false
      ? undefined
      : runtime.onContextChange(nextContext => {
          recordedStates.push(createStateSnapshot<State>(nextContext))
        }),
    options.recordOutputs === false
      ? undefined
      : runtime.onOutput(output => {
          recordedOutputs.push(output)
        }),
  ].filter(value => value !== undefined)

  const runSettleStep = async (): Promise<boolean> => {
    const stateCountBefore = recordedStates.length
    const outputCountBefore = recordedOutputs.length

    await Promise.resolve()
    await asyncDriver.flush()
    await timerDriver.advanceBy(0)
    await asyncDriver.flush()
    await Promise.resolve()

    const stateCountAfter = recordedStates.length
    const outputCountAfter = recordedOutputs.length

    return (
      stateCountBefore !== stateCountAfter ||
      outputCountBefore !== outputCountAfter
    )
  }

  const settle = async (options?: SettleOptions): Promise<void> => {
    const maxIterations = resolveMaxIterations(options?.maxIterations)

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const changed = await runSettleStep()

      if (!changed) {
        return
      }
    }

    throw new Error(
      `Harness did not settle within ${maxIterations} iterations.`,
    )
  }

  const waitForCondition = async <T>(waitOptions: {
    check: () => T | undefined
    maxIterations: number
    settleBetweenChecks: boolean
    timeoutMessage: string
  }): Promise<T> => {
    for (
      let iteration = 0;
      iteration < waitOptions.maxIterations;
      iteration += 1
    ) {
      const result = waitOptions.check()

      if (result !== undefined) {
        return result
      }

      if (!waitOptions.settleBetweenChecks) {
        await Promise.resolve()
        await asyncDriver.flush()
        continue
      }

      await runSettleStep()
    }

    throw new Error(waitOptions.timeoutMessage)
  }

  const waitForState = async (
    predicate: (state: State) => boolean,
    options?: WaitForStateOptions,
  ): Promise<State> => {
    const maxIterations = resolveMaxIterations(options?.maxIterations)
    const settleBetweenChecks = options?.settleBetweenChecks ?? true
    let matchedState: State | undefined
    const unsubscribe = runtime.onContextChange(context => {
      const nextState = context.currentState as State

      if (predicate(nextState)) {
        matchedState = nextState
      }
    })

    try {
      return await waitForCondition({
        check: () => {
          const state = runtime.currentState() as State

          if (predicate(state)) {
            return state
          }

          return matchedState
        },
        maxIterations,
        settleBetweenChecks,
        timeoutMessage: `State predicate did not match within ${maxIterations} iterations.`,
      })
    } finally {
      unsubscribe()
    }
  }

  const waitForOutput = async (
    typeOrPredicate:
      | HarnessOutputAction<OAM>["type"]
      | ((output: HarnessOutputAction<OAM>) => boolean),
    options?: WaitForOutputOptions,
  ): Promise<HarnessOutputAction<OAM>> => {
    const maxIterations = resolveMaxIterations(options?.maxIterations)
    const settleBetweenChecks = options?.settleBetweenChecks ?? true
    let matchedFromSubscription: HarnessOutputAction<OAM> | undefined
    const matches =
      typeof typeOrPredicate === "function"
        ? typeOrPredicate
        : (output: HarnessOutputAction<OAM>) => output.type === typeOrPredicate
    const unsubscribe = runtime.onOutput(output => {
      if (matches(output)) {
        matchedFromSubscription = output
      }
    })

    try {
      return await waitForCondition({
        check: () => {
          const matchedOutput = recordedOutputs.find(output => matches(output))

          if (matchedOutput) {
            return matchedOutput
          }

          return matchedFromSubscription
        },
        maxIterations,
        settleBetweenChecks,
        timeoutMessage: `Output predicate did not match within ${maxIterations} iterations.`,
      })
    } finally {
      unsubscribe()
    }
  }

  return {
    context,
    runtime,
    asyncDriver,
    timerDriver,
    start: async () => {
      await runtime.run(enter())
    },
    run: action => runtime.run(action),
    respondToOutput: (type, handler) => runtime.respondToOutput(type, handler),
    currentState: () => runtime.currentState() as State,
    currentHistory: () => runtime.currentHistory() as History<State>,
    states: () => recordedStates.slice(),
    outputs: () => recordedOutputs.slice(),
    lastState: () => lastItem(recordedStates),
    lastOutput: () => lastItem(recordedOutputs),
    flushAsync: () => asyncDriver.flush(),
    runAllAsync: () => asyncDriver.runAll(),
    advanceBy: ms => timerDriver.advanceBy(ms),
    advanceFrames: (count, frameMs) =>
      timerDriver.advanceFrames(count, frameMs),
    runAllTimers: () => timerDriver.runAll(),
    settle,
    waitForState,
    waitForOutput,
    clearRecords: () => {
      recordedStates.splice(0, recordedStates.length)
      recordedOutputs.splice(0, recordedOutputs.length)
    },
    disconnect: () => {
      unsubscribers.forEach(unsubscribe => {
        unsubscribe?.()
      })
      runtime.disconnect()
    },
  }
}
