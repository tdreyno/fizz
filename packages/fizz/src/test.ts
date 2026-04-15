import type { Action } from "./action.js"
import { beforeEnter, enter } from "./action.js"
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
  createRuntime,
} from "./runtime.js"
import type { StateTransition } from "./state.js"

type TestActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

type Logger = (
  msgs: readonly unknown[],
  level: "error" | "warn" | "log",
) => void

type HarnessState = StateTransition<string, any, unknown>

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
  run: (action: Action<string, unknown>) => Promise<void>
  respondToOutput: <
    OA extends ReturnType<OAM[keyof OAM]>,
    T extends OA["type"],
    A extends ReturnType<AM[keyof AM]>,
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
  const runtime = createRuntime(
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

  return {
    context,
    runtime,
    asyncDriver,
    timerDriver,
    start: async () => {
      await runtime.run(beforeEnter(runtime))
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
