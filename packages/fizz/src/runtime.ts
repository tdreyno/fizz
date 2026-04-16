import type { Action } from "./action.js"
import {
  asyncCancelled,
  beforeEnter,
  enter,
  intervalCancelled,
  intervalStarted,
  intervalTriggered,
  isAction,
  onFrame,
  timerCancelled,
  timerCompleted,
  timerStarted,
} from "./action.js"
import type { Context } from "./context.js"
import { createInitialContext } from "./context.js"
import type { MachineDefinition } from "./createMachine.js"
import type {
  CancelAsyncEffectData,
  CancelIntervalEffectData,
  CancelTimerEffectData,
  Effect,
  RestartIntervalEffectData,
  RestartTimerEffectData,
  StartAsyncEffectData,
  StartIntervalEffectData,
  StartTimerEffectData,
} from "./effect.js"
import { isEffect } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
import type { RuntimeAsyncDriver } from "./runtime/asyncDriver.js"
import { createDefaultAsyncDriver } from "./runtime/asyncDriver.js"
import type { ActiveAsync } from "./runtime/asyncScheduler.js"
import {
  cancelActiveAsyncOperation,
  clearAsyncOperations,
  isAbortError,
  runAsyncOperation,
  startAsyncOperation,
} from "./runtime/asyncScheduler.js"
import { dispatchEffect } from "./runtime/effectDispatcher.js"
import type { RuntimeTimerDriver } from "./runtime/timerDriver.js"
import { createDefaultTimerDriver } from "./runtime/timerDriver.js"
import type { ActiveFrame, ActiveTimer } from "./runtime/timerScheduler.js"
import {
  cancelActiveFrameOperation,
  cancelActiveIntervalOperation,
  cancelActiveTimerOperation,
  clearScheduledOperations,
  replaceIntervalOperation,
  replaceTimerOperation,
  startFrameOperation,
  startIntervalOperation,
  startTimerOperation,
} from "./runtime/timerScheduler.js"
import {
  buildGoBackCommands,
  buildStateTransitionCommands,
} from "./runtime/transitions.js"
import type { StateReturn, StateTransition } from "./state.js"
import { isStateTransition } from "./state.js"
import { arraySingleton, externalPromise } from "./util.js"

export type {
  ControlledAsyncDriver,
  RuntimeAsyncDriver,
} from "./runtime/asyncDriver.js"
export { createControlledAsyncDriver } from "./runtime/asyncDriver.js"
export type {
  ControlledTimerDriver,
  RuntimeTimerDriver,
} from "./runtime/timerDriver.js"
export { createControlledTimerDriver } from "./runtime/timerDriver.js"

export type RuntimeOptions = {
  asyncDriver?: RuntimeAsyncDriver
  debugLabel?: string
  monitor?: RuntimeMonitor
  timerDriver?: RuntimeTimerDriver
}

export type RuntimeContextOptions = {
  customLogger?: (
    msgs: readonly unknown[],
    level: "error" | "warn" | "log",
  ) => void
  enableLogging?: boolean
  maxHistory?: number
}

export type CreateRuntimeOptions = RuntimeContextOptions & RuntimeOptions

type ContextChangeSubscriber = (context: Context) => void
type RuntimeAction = Action<string, unknown>
type RuntimeState = StateTransition<string, Action<string, unknown>, unknown>
type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => RuntimeAction
}
type RuntimeStateMap = {
  [key: string]: (...args: Array<any>) => RuntimeState
}
type PromiseBoundActions<AM extends RuntimeActionMap> = {
  [K in keyof AM]: (...args: Parameters<AM[K]>) => {
    asPromise: () => Promise<void>
  }
}

type OutputSubscriber<
  OAM extends RuntimeActionMap,
  OA extends RuntimeAction = ReturnType<OAM[keyof OAM]>,
> = (action: OA) => void | Promise<void>

type RuntimeQueueValue = RuntimeAction | RuntimeState | Effect<unknown>

export type RuntimeDebugCommand =
  | {
      kind: "action"
      action: RuntimeAction
    }
  | {
      kind: "state"
      state: RuntimeState
    }
  | {
      kind: "effect"
      effect: Effect<unknown>
    }

export type RuntimeDebugCancellationReason = "cleanup" | "effect" | "restart"

export type RuntimeDebugEvent =
  | {
      action: RuntimeAction
      queueSize: number
      type: "action-enqueued"
    }
  | {
      command: RuntimeDebugCommand
      queueSize: number
      type: "command-started"
    }
  | {
      command: RuntimeDebugCommand
      generatedCommands: RuntimeDebugCommand[]
      type: "command-completed"
    }
  | {
      output: RuntimeAction
      type: "output-emitted"
    }
  | {
      context: Context
      currentState: RuntimeState
      previousState: RuntimeState | undefined
      type: "context-changed"
    }
  | {
      command: RuntimeDebugCommand
      error: unknown
      type: "runtime-error"
    }
  | {
      asyncId: string
      type: "async-started"
    }
  | {
      asyncId: string
      value: unknown
      type: "async-resolved"
    }
  | {
      asyncId: string
      error: unknown
      type: "async-rejected"
    }
  | {
      asyncId: string
      reason: RuntimeDebugCancellationReason
      type: "async-cancelled"
    }
  | {
      delay: number
      timeoutId: string
      type: "timer-started"
    }
  | {
      delay: number
      timeoutId: string
      type: "timer-completed"
    }
  | {
      delay: number
      reason: RuntimeDebugCancellationReason
      timeoutId: string
      type: "timer-cancelled"
    }
  | {
      delay: number
      intervalId: string
      type: "interval-started"
    }
  | {
      delay: number
      intervalId: string
      type: "interval-triggered"
    }
  | {
      delay: number
      intervalId: string
      reason: RuntimeDebugCancellationReason
      type: "interval-cancelled"
    }
  | {
      type: "frame-started"
    }
  | {
      timestamp: number
      type: "frame-triggered"
    }
  | {
      reason: RuntimeDebugCancellationReason
      type: "frame-cancelled"
    }

export type RuntimeMonitor = (event: RuntimeDebugEvent) => void

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

type QueueItem = {
  onComplete: () => void
  onError: (e: unknown) => void
  item: RuntimeDebugCommand
}

export class Runtime<
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> {
  readonly #asyncDriver: RuntimeAsyncDriver
  readonly #asyncOperations = new Map<string, ActiveAsync>()
  readonly #contextChangeSubscribers = new Set<ContextChangeSubscriber>()
  readonly #disconnectSubscribers = new Set<() => void>()
  #lastContextState: RuntimeState | undefined
  readonly #monitors = new Set<RuntimeMonitor>()
  readonly #outputSubscribers = new Set<OutputSubscriber<OAM>>()
  readonly #validActions: Set<string>
  readonly #timerDriver: RuntimeTimerDriver
  readonly #timers = new Map<string, ActiveTimer>()
  readonly #intervals = new Map<string, ActiveTimer>()
  #frame: ActiveFrame | undefined
  #asyncCounter = 1
  #asyncIdCounter = 1
  #hasEnteredInitialState = false
  #queue: QueueItem[] = []
  #isRunning = false
  #timerCounter = 1

  constructor(
    public context: Context,
    public internalActions: AM = {} as AM,
    public outputActions: OAM = {} as OAM,
    options: RuntimeOptions = {},
  ) {
    this.#validActions = Object.keys(internalActions).reduce(
      (sum, action) => sum.add(action.toLowerCase()),
      new Set<string>(),
    )
    this.#asyncDriver = options.asyncDriver ?? createDefaultAsyncDriver()
    this.#lastContextState = context.currentState as RuntimeState | undefined
    this.#timerDriver = options.timerDriver ?? createDefaultTimerDriver()

    if (options.monitor) {
      this.#monitors.add(options.monitor)
    }

    this.#attachChromeDebuggerHook(options.debugLabel)
  }

  currentState(): RuntimeState {
    return this.context.currentState as RuntimeState
  }

  currentHistory() {
    return this.context.history
  }

  onContextChange(fn: ContextChangeSubscriber): () => void {
    this.#contextChangeSubscribers.add(fn)

    return () => this.#contextChangeSubscribers.delete(fn)
  }

  onOutput(fn: OutputSubscriber<OAM>): () => void {
    this.#outputSubscribers.add(fn)

    return () => this.#outputSubscribers.delete(fn)
  }

  onDisconnect(fn: () => void): () => void {
    this.#disconnectSubscribers.add(fn)

    return () => this.#disconnectSubscribers.delete(fn)
  }

  addMonitor(fn: RuntimeMonitor): () => void {
    this.#monitors.add(fn)

    return () => this.#monitors.delete(fn)
  }

  respondToOutput<
    OA extends ReturnType<OAM[keyof OAM]>,
    T extends OA["type"],
    A extends ReturnType<AM[keyof AM]>,
  >(
    type: T,
    handler: (
      payload: Extract<OA, { type: T }>["payload"],
    ) => Promise<A> | A | void,
  ): () => void {
    return this.onOutput(async output => {
      if (output.type === type) {
        const maybeAction = await handler(
          (output as Extract<OA, { type: T }>).payload,
        )

        if (maybeAction) {
          await this.run(maybeAction)
        }
      }
    })
  }

  disconnect(): void {
    this.#clearAsync()
    this.#clearTimers()
    this.#contextChangeSubscribers.clear()
    this.#outputSubscribers.clear()

    this.#disconnectSubscribers.forEach(disconnect => {
      disconnect()
    })
    this.#disconnectSubscribers.clear()
  }

  canHandle(action: RuntimeAction): boolean {
    return this.#validActions.has(action.type.toLowerCase())
  }

  bindActions<PM = PromiseBoundActions<AM>>(actions: AM): PM {
    const boundActions = {} as PromiseBoundActions<AM>

    ;(Object.keys(actions) as Array<keyof AM>).forEach(key => {
      const actionCreator = actions[key]

      if (!actionCreator) {
        return
      }

      boundActions[key] = ((...args: Parameters<typeof actionCreator>) => {
        const promise = this.run(actionCreator(...args))

        return {
          asPromise: () => promise,
        }
      }) as PromiseBoundActions<AM>[typeof key]
    })

    return boundActions as PM
  }

  async run(action: RuntimeAction): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.#queue.push({
        onComplete: resolve,
        onError: reject,
        item: this.#toCommand(action),
      })

      this.#emitMonitor({
        action,
        queueSize: this.#queue.length,
        type: "action-enqueued",
      })
    })

    if (!this.#isRunning) {
      this.#isRunning = true
      void this.#processQueueHead()
    }

    await promise

    this.#contextDidChange()
  }

  async #processQueueHead(): Promise<void> {
    const head = this.#queue.shift()

    if (!head) {
      this.#isRunning = false
      return
    }

    const { item, onComplete, onError } = head

    this.#validateCurrentState()
    this.#emitMonitor({
      command: item,
      queueSize: this.#queue.length,
      type: "command-started",
    })

    try {
      const commands = await this.#executeCommand(item)
      this.#emitMonitor({
        command: item,
        generatedCommands: commands,
        type: "command-completed",
      })
      const { promise, items } = this.#commandsToQueueItems(commands)

      this.#queue = [...items, ...this.#queue]

      void promise.then(() => onComplete()).catch(e => onError(e))

      setTimeout(() => {
        void this.#processQueueHead()
      }, 0)
    } catch (e) {
      this.#emitMonitor({
        command: item,
        error: e,
        type: "runtime-error",
      })
      onError(e)
      this.#isRunning = false
      this.#queue.length = 0
    }
  }

  async #executeCommand(
    item: QueueItem["item"],
  ): Promise<RuntimeDebugCommand[]> {
    if (item.kind === "action") {
      return this.#executeAction(item.action)
    }

    if (item.kind === "state") {
      return this.#handleState(item.state)
    }

    if (item.kind === "effect") {
      return this.#handleEffectItem(item.effect)
    }

    throw new UnknownStateReturnType(item)
  }

  #toCommand(item: RuntimeQueueValue): RuntimeDebugCommand {
    if (isAction(item)) {
      return this.#actionCommand(item)
    }

    if (isStateTransition(item)) {
      return this.#stateCommand(item as RuntimeState)
    }

    if (isEffect(item)) {
      return this.#effectCommand(item)
    }

    throw new UnknownStateReturnType(item)
  }

  #actionCommand(action: RuntimeAction): RuntimeDebugCommand {
    return {
      action,
      kind: "action",
    }
  }

  #stateCommand(state: RuntimeState): RuntimeDebugCommand {
    return {
      kind: "state",
      state,
    }
  }

  #effectCommand(effectValue: Effect<unknown>): RuntimeDebugCommand {
    return {
      effect: effectValue,
      kind: "effect",
    }
  }

  #handleEffectItem(item: Effect<unknown>): RuntimeDebugCommand[] {
    return dispatchEffect<RuntimeDebugCommand, ReturnType<OAM[keyof OAM]>>(
      item,
      {
        emitOutput: output => {
          this.#emitMonitor({
            output,
            type: "output-emitted",
          })

          this.#outputSubscribers.forEach(sub => {
            void sub(output)
          })
        },
        handleCancelAsync: data => this.#handleCancelAsync(data),
        handleCancelFrame: () => this.#handleCancelFrame(),
        handleCancelInterval: data => this.#handleCancelInterval(data),
        handleCancelTimer: data => this.#handleCancelTimer(data),
        handleGoBack: () => this.#handleGoBack(),
        handleRestartInterval: data => this.#handleRestartInterval(data),
        handleRestartTimer: data => this.#handleRestartTimer(data),
        handleStartAsync: data => this.#handleStartAsync(data),
        handleStartFrame: () => this.#handleStartFrame(),
        handleStartInterval: data => this.#handleStartInterval(data),
        handleStartTimer: data => this.#handleStartTimer(data),
        runEffect: effectItem => this.#runEffect(effectItem),
      },
    )
  }

  #stateReturnsToCommands(stateReturns: StateReturn[]): RuntimeDebugCommand[] {
    return stateReturns.map(item => this.#toCommand(item))
  }

  #commandsToQueueItems(commands: RuntimeDebugCommand[]): {
    items: QueueItem[]
    promise: Promise<void[]>
  } {
    const { promises, items } = commands.reduce(
      (acc, item) => {
        const { promise, reject, resolve } = externalPromise<void>()

        acc.promises.push(promise)
        acc.items.push({
          item,
          onComplete: resolve,
          onError: reject,
        })

        return acc
      },
      {
        items: [] as QueueItem[],
        promises: [] as Promise<void>[],
      },
    )

    return { items, promise: Promise.all(promises) }
  }

  #contextDidChange() {
    const currentState = this.currentState()

    this.#emitMonitor({
      context: this.context,
      currentState,
      previousState: this.#lastContextState,
      type: "context-changed",
    })

    this.#lastContextState = currentState

    this.#contextChangeSubscribers.forEach(sub => sub(this.context))
  }

  #emitMonitor(event: RuntimeDebugEvent) {
    this.#monitors.forEach(monitor => {
      monitor(event)
    })
  }

  #attachChromeDebuggerHook(label?: string) {
    const hook = getRuntimeChromeDebuggerHook()

    if (!hook) {
      return
    }

    const cleanup = hook.registerRuntime(
      label === undefined
        ? {
            runtime: this as Runtime<any, any>,
          }
        : {
            label,
            runtime: this as Runtime<any, any>,
          },
    )

    if (cleanup) {
      this.onDisconnect(cleanup)
    }
  }

  #validateCurrentState() {
    const runCurrentState = this.currentState()

    if (!runCurrentState) {
      throw new Error(
        `Fizz could not find current state to run action on. History: ${JSON.stringify(
          this.currentHistory()
            .toArray()
            .map(({ name }) => name)
            .join(" -> "),
        )}`,
      )
    }
  }

  #runEffect(effectItem: Effect<unknown>) {
    effectItem.executor(this.context)
  }

  #handleStartAsync<Resolved>(
    data: StartAsyncEffectData<Resolved, string>,
  ): RuntimeDebugCommand[] {
    const asyncId = data.asyncId ?? `__fizz_async__${this.#asyncIdCounter++}`

    if (this.#asyncOperations.has(asyncId)) {
      this.#emitMonitor({
        asyncId,
        reason: "restart",
        type: "async-cancelled",
      })
    }

    this.#emitMonitor({
      asyncId,
      type: "async-started",
    })

    startAsyncOperation({
      asyncDriver: this.#asyncDriver,
      asyncId,
      asyncOperations: this.#asyncOperations,
      createController: () => new AbortController(),
      data,
      isAbortError,
      nextToken: () => this.#asyncCounter++,
      onReject: (eventAsyncId: string, error: unknown) => {
        this.#emitMonitor({
          asyncId: eventAsyncId,
          error,
          type: "async-rejected",
        })
      },
      onResolve: (eventAsyncId: string, value: Resolved) => {
        this.#emitMonitor({
          asyncId: eventAsyncId,
          type: "async-resolved",
          value,
        })
      },
      run: action => this.run(action),
      runAsyncOperation: (run, signal) =>
        runAsyncOperation(this.context, run, signal),
    })

    return []
  }

  #handleCancelAsync<AsyncId extends string>(
    data: CancelAsyncEffectData<AsyncId>,
  ): RuntimeDebugCommand[] {
    const cancelled = cancelActiveAsyncOperation({
      asyncDriver: this.#asyncDriver,
      asyncId: data.asyncId,
      asyncOperations: this.#asyncOperations,
    })

    if (cancelled) {
      this.#emitMonitor({
        asyncId: data.asyncId,
        reason: "effect",
        type: "async-cancelled",
      })
    }

    return cancelled
      ? [this.#actionCommand(asyncCancelled({ asyncId: data.asyncId }))]
      : []
  }

  #handleStartTimer<TimeoutId extends string>(
    data: StartTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] {
    const replacedTimer = this.#timers.get(data.timeoutId)

    if (replacedTimer) {
      this.#emitMonitor({
        delay: replacedTimer.delay,
        reason: "restart",
        timeoutId: data.timeoutId,
        type: "timer-cancelled",
      })
    }

    replaceTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    startTimerOperation({
      delay: data.delay,
      nextToken: () => this.#timerCounter++,
      onElapsed: async token => {
        const activeTimer = this.#timers.get(data.timeoutId)

        if (activeTimer?.token !== token) {
          return
        }

        this.#timers.delete(data.timeoutId)
        this.#emitMonitor({
          delay: data.delay,
          timeoutId: data.timeoutId,
          type: "timer-completed",
        })
        await this.run(timerCompleted(data))
      },
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    this.#emitMonitor({
      delay: data.delay,
      timeoutId: data.timeoutId,
      type: "timer-started",
    })

    return [this.#actionCommand(timerStarted(data))]
  }

  #handleCancelTimer<TimeoutId extends string>(
    data: CancelTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] {
    const cancelled = cancelActiveTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    if (!cancelled) {
      return []
    }

    this.#emitMonitor({
      delay: cancelled.delay,
      reason: "effect",
      timeoutId: data.timeoutId,
      type: "timer-cancelled",
    })

    return [
      this.#actionCommand(
        timerCancelled({ timeoutId: data.timeoutId, delay: cancelled.delay }),
      ),
    ]
  }

  #handleRestartTimer<TimeoutId extends string>(
    data: RestartTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] {
    const cancelled = cancelActiveTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    return [
      ...(cancelled
        ? [
            this.#actionCommand(
              timerCancelled({
                timeoutId: data.timeoutId,
                delay: cancelled.delay,
              }),
            ),
          ]
        : []),
      ...this.#handleStartTimer(data),
    ]
  }

  #handleStartInterval<IntervalId extends string>(
    data: StartIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] {
    const replacedInterval = this.#intervals.get(data.intervalId)

    if (replacedInterval) {
      this.#emitMonitor({
        delay: replacedInterval.delay,
        intervalId: data.intervalId,
        reason: "restart",
        type: "interval-cancelled",
      })
    }

    replaceIntervalOperation({
      intervalId: data.intervalId,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
    })

    startIntervalOperation({
      delay: data.delay,
      intervalId: data.intervalId,
      intervals: this.#intervals,
      nextToken: () => this.#timerCounter++,
      onElapsed: async token => {
        const activeInterval = this.#intervals.get(data.intervalId)

        if (activeInterval?.token !== token) {
          return
        }

        this.#emitMonitor({
          delay: data.delay,
          intervalId: data.intervalId,
          type: "interval-triggered",
        })
        await this.run(intervalTriggered(data))
      },
      timerDriver: this.#timerDriver,
    })

    this.#emitMonitor({
      delay: data.delay,
      intervalId: data.intervalId,
      type: "interval-started",
    })

    return [this.#actionCommand(intervalStarted(data))]
  }

  #handleCancelInterval<IntervalId extends string>(
    data: CancelIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] {
    const cancelled = cancelActiveIntervalOperation({
      intervalId: data.intervalId,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
    })

    if (!cancelled) {
      return []
    }

    this.#emitMonitor({
      delay: cancelled.delay,
      intervalId: data.intervalId,
      reason: "effect",
      type: "interval-cancelled",
    })

    return [
      this.#actionCommand(
        intervalCancelled({
          intervalId: data.intervalId,
          delay: cancelled.delay,
        }),
      ),
    ]
  }

  #handleRestartInterval<IntervalId extends string>(
    data: RestartIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] {
    const cancelled = cancelActiveIntervalOperation({
      intervalId: data.intervalId,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
    })

    return [
      ...(cancelled
        ? [
            this.#actionCommand(
              intervalCancelled({
                intervalId: data.intervalId,
                delay: cancelled.delay,
              }),
            ),
          ]
        : []),
      ...this.#handleStartInterval(data),
    ]
  }

  #handleStartFrame(): RuntimeDebugCommand[] {
    this.#cancelActiveFrame("restart")

    this.#frame = startFrameOperation({
      nextToken: () => this.#timerCounter++,
      onFrame: async (timestamp, token) => {
        if (this.#frame?.token !== token) {
          return
        }

        this.#emitMonitor({
          timestamp,
          type: "frame-triggered",
        })
        await this.run(onFrame(timestamp))
      },
      timerDriver: this.#timerDriver,
    })

    this.#emitMonitor({
      type: "frame-started",
    })

    return []
  }

  #handleCancelFrame(): RuntimeDebugCommand[] {
    this.#cancelActiveFrame("effect")

    return []
  }

  #cancelActiveFrame(reason: RuntimeDebugCancellationReason) {
    if (this.#frame) {
      this.#emitMonitor({
        reason,
        type: "frame-cancelled",
      })
    }

    cancelActiveFrameOperation({
      frame: this.#frame,
      timerDriver: this.#timerDriver,
    })

    this.#frame = undefined
  }

  #clearTimers() {
    this.#timers.forEach((timer, timeoutId) => {
      this.#emitMonitor({
        delay: timer.delay,
        reason: "cleanup",
        timeoutId,
        type: "timer-cancelled",
      })
    })

    this.#intervals.forEach((interval, intervalId) => {
      this.#emitMonitor({
        delay: interval.delay,
        intervalId,
        reason: "cleanup",
        type: "interval-cancelled",
      })
    })

    if (this.#frame) {
      this.#emitMonitor({
        reason: "cleanup",
        type: "frame-cancelled",
      })
    }

    clearScheduledOperations({
      frame: this.#frame,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    this.#frame = undefined
  }

  #clearAsync() {
    this.#asyncOperations.forEach((_activeAsync, asyncId) => {
      this.#emitMonitor({
        asyncId,
        reason: "cleanup",
        type: "async-cancelled",
      })
    })

    clearAsyncOperations({
      asyncDriver: this.#asyncDriver,
      asyncOperations: this.#asyncOperations,
    })
  }

  async #executeAction<A extends RuntimeAction>(
    action: A,
  ): Promise<RuntimeDebugCommand[]> {
    if (action.type === enter.type && !this.#hasEnteredInitialState) {
      this.#hasEnteredInitialState = true

      return [
        this.#actionCommand(beforeEnter(this)),
        this.#actionCommand(action),
      ]
    }

    const targetState = this.context.currentState

    if (!targetState) {
      throw new MissingCurrentState("Must provide a current state")
    }

    const result = await targetState.executor(action, this)

    return this.#stateReturnsToCommands(arraySingleton(result))
  }

  #handleState(targetState: RuntimeState): RuntimeDebugCommand[] {
    return buildStateTransitionCommands({
      actionCommand: action => this.#actionCommand(action),
      clearAsync: () => this.#clearAsync(),
      clearTimers: () => this.#clearTimers(),
      context: this.context,
      effectCommand: effectItem => this.#effectCommand(effectItem),
      notifyContextDidChange: () => this.#contextDidChange(),
      runtime: this,
      targetState,
    })
  }

  #handleGoBack(): RuntimeDebugCommand[] {
    return buildGoBackCommands({
      actionCommand: action => this.#actionCommand(action),
      clearAsync: () => this.#clearAsync(),
      clearTimers: () => this.#clearTimers(),
      context: this.context,
      effectCommand: effectItem => this.#effectCommand(effectItem),
      runtime: this,
    })
  }
}

const splitCreateRuntimeOptions = (options: CreateRuntimeOptions = {}) => {
  const context: RuntimeContextOptions = {}
  const runtime: RuntimeOptions = {}

  if (options.customLogger) {
    context.customLogger = options.customLogger
  }

  if ("enableLogging" in options) {
    context.enableLogging = options.enableLogging
  }

  if ("maxHistory" in options) {
    context.maxHistory = options.maxHistory
  }

  if (options.asyncDriver) {
    runtime.asyncDriver = options.asyncDriver
  }

  if (options.debugLabel) {
    runtime.debugLabel = options.debugLabel
  }

  if (options.monitor) {
    runtime.monitor = options.monitor
  }

  if (options.timerDriver) {
    runtime.timerDriver = options.timerDriver
  }

  return {
    context,
    runtime,
  }
}

export function createRuntime<
  SM extends RuntimeStateMap,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
  options?: CreateRuntimeOptions,
): Runtime<AM, OAM>

export function createRuntime<
  SM extends RuntimeStateMap,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
  options?: CreateRuntimeOptions,
): Runtime<AM, OAM> {
  if (!initialState) {
    throw new Error(
      "createRuntime(machine, initialState) requires an initial state",
    )
  }

  const { context, runtime } = splitCreateRuntimeOptions(options)

  return new Runtime(
    createInitialContext([initialState], context),
    (machine.actions ?? {}) as AM,
    (machine.outputActions ?? {}) as OAM,
    machine.name === undefined
      ? runtime
      : {
          ...runtime,
          debugLabel: machine.name,
        },
  )
}
