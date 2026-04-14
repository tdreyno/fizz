import type { Action, IntervalPayload, TimerPayload } from "./action.js"
import {
  asyncCancelled,
  beforeEnter,
  enter,
  exit,
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
import { effect, isEffect, log } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
import type { StateReturn, StateTransition } from "./state.js"
import { isStateTransition } from "./state.js"
import { arraySingleton, externalPromise } from "./util.js"

type ContextChangeSubscriber = (context: Context) => void
type RuntimeAction = Action<string, unknown>
type RuntimeState = StateTransition<string, any, unknown>
type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => RuntimeAction
}

type OutputSubscriber<
  OAM extends RuntimeActionMap,
  OA extends RuntimeAction = ReturnType<OAM[keyof OAM]>,
> = (action: OA) => void | Promise<void>

type QueueItem = {
  onComplete: () => void
  onError: (e: unknown) => void
  item: RuntimeAction | RuntimeState | Effect<unknown>
}

export interface RuntimeTimerDriver {
  start: (delay: number, onElapsed: () => Promise<void> | void) => unknown
  startInterval: (
    delay: number,
    onElapsed: () => Promise<void> | void,
  ) => unknown
  startFrame: (onFrame: (timestamp: number) => Promise<void> | void) => unknown
  cancel: (handle: unknown) => void
}

export interface ControlledTimerDriver extends RuntimeTimerDriver {
  advanceBy: (ms: number) => Promise<void>
  advanceFrames: (count: number, frameMs?: number) => Promise<void>
  runAll: () => Promise<void>
}

export interface RuntimeAsyncDriver {
  cancel: (handle: unknown) => void
  start: <T>(options: {
    onReject: (error: unknown) => Promise<void> | void
    onResolve: (value: T) => Promise<void> | void
    run: () => Promise<T>
  }) => unknown
}

export interface ControlledAsyncDriver extends RuntimeAsyncDriver {
  flush: () => Promise<void>
  runAll: () => Promise<void>
}

type RuntimeOptions = {
  asyncDriver?: RuntimeAsyncDriver
  timerDriver?: RuntimeTimerDriver
}

type ActiveTimer = {
  delay: number
  handle: unknown
  token: number
}

type ActiveFrame = {
  handle: unknown
  token: number
}

type ActiveAsync = {
  controller: AbortController
  handle: unknown
  token: number
}

type DefaultDriverHandle =
  | {
      handle: ReturnType<typeof setTimeout>
      kind: "timer"
    }
  | {
      handle: ReturnType<typeof setInterval>
      kind: "interval"
    }
  | {
      active: boolean
      handle: number | null
      kind: "frame"
    }

const createDefaultTimerDriver = (): RuntimeTimerDriver => {
  const scheduleFrame = (
    frameHandle: Extract<DefaultDriverHandle, { kind: "frame" }>,
    onElapsed: (timestamp: number) => Promise<void> | void,
  ) => {
    frameHandle.handle = requestAnimationFrame(timestamp => {
      if (!frameHandle.active) {
        return
      }

      void onElapsed(timestamp)

      if (frameHandle.active) {
        scheduleFrame(frameHandle, onElapsed)
      }
    })
  }

  return {
    start: (delay, onElapsed) => ({
      handle: setTimeout(() => {
        void onElapsed()
      }, delay),
      kind: "timer",
    }),
    startInterval: (delay, onElapsed) => ({
      handle: setInterval(() => {
        void onElapsed()
      }, delay),
      kind: "interval",
    }),
    startFrame: onElapsed => {
      const handle: Extract<DefaultDriverHandle, { kind: "frame" }> = {
        active: true,
        handle: null,
        kind: "frame",
      }

      scheduleFrame(handle, onElapsed)

      return handle
    },
    cancel: handle => {
      const driverHandle = handle as DefaultDriverHandle

      if (driverHandle.kind === "timer") {
        clearTimeout(driverHandle.handle)
        return
      }

      if (driverHandle.kind === "interval") {
        clearInterval(driverHandle.handle)
        return
      }

      driverHandle.active = false

      if (driverHandle.handle !== null) {
        cancelAnimationFrame(driverHandle.handle)
      }
    },
  }
}

const createDefaultAsyncDriver = (): RuntimeAsyncDriver => ({
  cancel: handle => {
    ;(handle as { active?: boolean }).active = false
  },
  start: ({ onReject, onResolve, run }) => {
    const handle = { active: true }

    void run()
      .then(value => {
        if (handle.active) {
          return onResolve(value)
        }
      })
      .catch(error => {
        if (handle.active) {
          return onReject(error)
        }
      })

    return handle
  },
})

export const createControlledTimerDriver = (): ControlledTimerDriver => {
  let now = 0
  let counter = 1

  const timers = new Map<
    number,
    {
      active: boolean
      delay: number
      dueAt: number
      onElapsed: () => Promise<void> | void
      repeats: boolean
    }
  >()
  const frames = new Map<
    number,
    {
      active: boolean
      onFrame: (timestamp: number) => Promise<void> | void
    }
  >()

  const driver: ControlledTimerDriver = {
    start: (delay, onElapsed) => {
      const id = counter++

      timers.set(id, {
        active: true,
        delay,
        dueAt: now + delay,
        onElapsed,
        repeats: false,
      })

      return id
    },

    startInterval: (delay, onElapsed) => {
      const id = counter++

      timers.set(id, {
        active: true,
        delay,
        dueAt: now + delay,
        onElapsed,
        repeats: true,
      })

      return id
    },

    startFrame: onFrame => {
      const id = counter++

      frames.set(id, {
        active: true,
        onFrame,
      })

      return id
    },

    cancel: handle => {
      const timerId = handle as number
      const timer = timers.get(timerId)

      if (timer) {
        timer.active = false
        timers.delete(timerId)
        return
      }

      const frame = frames.get(timerId)

      if (!frame) {
        return
      }

      frame.active = false
      frames.delete(timerId)
    },

    advanceBy: async ms => {
      const target = now + ms

      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.active && timer.dueAt <= target)
          .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0]

        if (!next) {
          break
        }

        const [id, timer] = next

        now = timer.dueAt

        if (timer.repeats) {
          timer.dueAt += timer.delay
        } else {
          timers.delete(id)
        }

        await timer.onElapsed()
      }

      now = target
    },

    advanceFrames: async (count, frameMs = 16) => {
      for (let index = 0; index < count; index += 1) {
        now += frameMs

        const currentFrames = [...frames.entries()].filter(
          ([, frame]) => frame.active,
        )

        for (const [id, frame] of currentFrames) {
          if (!frames.has(id) || !frame.active) {
            continue
          }

          await frame.onFrame(now)
        }
      }
    },

    runAll: async () => {
      while (timers.size > 0) {
        const nextDueAt = [...timers.values()]
          .filter(timer => timer.active)
          .sort((left, right) => left.dueAt - right.dueAt)[0]?.dueAt

        if (nextDueAt === undefined) {
          break
        }

        await driver.advanceBy(nextDueAt - now)
      }
    },
  }

  return driver
}

export const createControlledAsyncDriver = (): ControlledAsyncDriver => {
  let counter = 1

  const operations = new Map<
    number,
    {
      active: boolean
      pending: Array<() => Promise<void> | void>
    }
  >()

  const driver: ControlledAsyncDriver = {
    cancel: handle => {
      const operationId = handle as number
      const operation = operations.get(operationId)

      if (!operation) {
        return
      }

      operation.active = false
      operation.pending = []
      operations.delete(operationId)
    },

    start: ({ onReject, onResolve, run }) => {
      const operationId = counter++

      operations.set(operationId, {
        active: true,
        pending: [],
      })

      void run()
        .then(value => {
          const operation = operations.get(operationId)

          if (!operation?.active) {
            return
          }

          operation.pending.push(() => onResolve(value))
        })
        .catch(error => {
          const operation = operations.get(operationId)

          if (!operation?.active) {
            return
          }

          operation.pending.push(() => onReject(error))
        })

      return operationId
    },

    flush: async () => {
      await Promise.resolve()
      await Promise.resolve()

      const pending = [...operations.values()].flatMap(operation =>
        operation.active ? operation.pending.splice(0) : [],
      )

      for (const task of pending) {
        await task()
      }
    },

    runAll: async () => {
      while (
        [...operations.values()].some(operation => operation.pending.length > 0)
      ) {
        await driver.flush()
      }
    },
  }

  return driver
}

export class Runtime<
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> {
  readonly #asyncDriver: RuntimeAsyncDriver
  readonly #asyncOperations = new Map<string, ActiveAsync>()
  readonly #contextChangeSubscribers = new Set<ContextChangeSubscriber>()
  readonly #outputSubscribers = new Set<OutputSubscriber<OAM>>()
  readonly #validActions: Set<string>
  readonly #timerDriver: RuntimeTimerDriver
  readonly #timers = new Map<string, ActiveTimer>()
  readonly #intervals = new Map<string, ActiveTimer>()
  #frame: ActiveFrame | undefined
  #asyncCounter = 1
  #asyncIdCounter = 1
  #queue: QueueItem[] = []
  #isRunning = false
  #timerCounter = 1

  constructor(
    public context: Context,
    public internalActions: AM,
    public outputActions: OAM,
    options: RuntimeOptions = {},
  ) {
    this.#validActions = Object.keys(internalActions).reduce(
      (sum, action) => sum.add(action.toLowerCase()),
      new Set<string>(),
    )
    this.#asyncDriver = options.asyncDriver ?? createDefaultAsyncDriver()
    this.#timerDriver = options.timerDriver ?? createDefaultTimerDriver()
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
    this.#contextChangeSubscribers.clear()
  }

  canHandle(action: RuntimeAction): boolean {
    return this.#validActions.has(action.type.toLowerCase())
  }

  bindActions<
    AM extends RuntimeActionMap,
    PM = {
      [K in keyof AM]: (...args: Parameters<AM[K]>) => {
        asPromise: () => Promise<void>
      }
    },
  >(actions: AM): PM {
    return Object.keys(actions).reduce(
      (sum, key) => {
        sum[key] = (...args: Array<any>) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const promise = this.run(actions[key]!(...args))

          return {
            asPromise: () => promise,
          }
        }

        return sum
      },
      {} as Record<string, any>,
    ) as PM
  }

  async run(action: RuntimeAction): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.#queue.push({
        onComplete: resolve,
        onError: reject,
        item: action,
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

    // Make sure we're in a valid state.
    this.#validateCurrentState()

    try {
      const results = await this.#queueItemToStateReturns(item)

      const { promise, items } = this.#stateReturnsToQueueItems(results)

      // New items go to front of queue
      this.#queue = [...items, ...this.#queue]

      void promise.then(() => onComplete()).catch(e => onError(e))

      setTimeout(() => {
        void this.#processQueueHead()
      }, 0)
    } catch (e) {
      onError(e)
      this.#isRunning = false
      this.#queue.length = 0
    }
  }

  async #queueItemToStateReturns(
    item: QueueItem["item"],
  ): Promise<StateReturn[]> {
    if (isAction(item)) {
      return this.#executeAction(item)
    }

    if (isStateTransition(item)) {
      return this.#handleState(item)
    }

    if (isEffect(item)) {
      return this.#handleEffectItem(item)
    }

    // Should be impossible to get here with TypeScript,
    // but could happen with plain JS.
    throw new UnknownStateReturnType(item)
  }

  #handleEffectItem(item: Effect<unknown>): StateReturn[] {
    if (item.label === "goBack") {
      return this.#handleGoBack()
    }

    if (item.label === "output") {
      this.#outputSubscribers.forEach(sub => {
        void sub(item.data as ReturnType<OAM[keyof OAM]>)
      })

      return []
    }

    if (item.label === "startTimer") {
      return this.#handleStartTimer(item.data as StartTimerEffectData<string>)
    }

    if (item.label === "startAsync") {
      return this.#handleStartAsync(
        item.data as StartAsyncEffectData<unknown, string>,
      )
    }

    if (item.label === "cancelTimer") {
      return this.#handleCancelTimer(item.data as CancelTimerEffectData<string>)
    }

    if (item.label === "cancelAsync") {
      return this.#handleCancelAsync(item.data as CancelAsyncEffectData<string>)
    }

    if (item.label === "restartTimer") {
      return this.#handleRestartTimer(
        item.data as RestartTimerEffectData<string>,
      )
    }

    if (item.label === "startInterval") {
      return this.#handleStartInterval(
        item.data as StartIntervalEffectData<string>,
      )
    }

    if (item.label === "cancelInterval") {
      return this.#handleCancelInterval(
        item.data as CancelIntervalEffectData<string>,
      )
    }

    if (item.label === "restartInterval") {
      return this.#handleRestartInterval(
        item.data as RestartIntervalEffectData<string>,
      )
    }

    if (item.label === "startFrame") {
      return this.#handleStartFrame()
    }

    if (item.label === "cancelFrame") {
      return this.#handleCancelFrame()
    }

    this.#runEffect(item)

    return []
  }

  #stateReturnsToQueueItems(stateReturns: StateReturn[]): {
    promise: Promise<void[]>
    items: QueueItem[]
  } {
    const { promises, items } = stateReturns.reduce(
      (acc, item) => {
        const { promise, resolve, reject } = externalPromise<void>()

        acc.promises.push(promise)

        acc.items.push({
          onComplete: resolve,
          onError: reject,
          item,
        })

        return acc
      },
      {
        promises: [] as Promise<void>[],
        items: [] as QueueItem[],
      },
    )

    return { promise: Promise.all(promises), items }
  }

  #contextDidChange() {
    this.#contextChangeSubscribers.forEach(sub => sub(this.context))
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

  #runEffect(e: Effect<unknown>) {
    e.executor(this.context)
  }

  #handleStartAsync<Resolved>(
    data: StartAsyncEffectData<Resolved, string>,
  ): StateReturn[] {
    const asyncId = data.asyncId ?? `__fizz_async__${this.#asyncIdCounter++}`

    this.#replaceAsync(asyncId)

    const controller = new AbortController()
    const token = this.#asyncCounter++
    const handle = this.#asyncDriver.start({
      onReject: async error => {
        const activeAsync = this.#asyncOperations.get(asyncId)

        if (activeAsync?.token !== token) {
          return
        }

        this.#asyncOperations.delete(asyncId)

        if (this.#isAbortError(error, controller.signal)) {
          return
        }

        const action = data.handlers.reject?.(error)

        if (action) {
          await this.run(action)
        }
      },
      onResolve: async value => {
        const activeAsync = this.#asyncOperations.get(asyncId)

        if (activeAsync?.token !== token) {
          return
        }

        this.#asyncOperations.delete(asyncId)

        const action = data.handlers.resolve?.(value)

        if (action) {
          await this.run(action)
        }
      },
      run: () => this.#runAsyncOperation(data.run, controller.signal),
    })

    this.#asyncOperations.set(asyncId, {
      controller,
      handle,
      token,
    })

    return []
  }

  #handleCancelAsync<AsyncId extends string>(
    data: CancelAsyncEffectData<AsyncId>,
  ): StateReturn[] {
    const cancelled = this.#cancelActiveAsync(data.asyncId)

    return cancelled ? [asyncCancelled({ asyncId: data.asyncId })] : []
  }

  #handleStartTimer<TimeoutId extends string>(
    data: StartTimerEffectData<TimeoutId>,
  ): StateReturn[] {
    this.#replaceTimer(data.timeoutId)

    const token = this.#timerCounter++
    const handle = this.#timerDriver.start(data.delay, async () => {
      const activeTimer = this.#timers.get(data.timeoutId)

      if (activeTimer?.token !== token) {
        return
      }

      this.#timers.delete(data.timeoutId)
      await this.run(timerCompleted(data))
    })

    this.#timers.set(data.timeoutId, {
      delay: data.delay,
      handle,
      token,
    })

    return [timerStarted(data)]
  }

  #handleCancelTimer<TimeoutId extends string>(
    data: CancelTimerEffectData<TimeoutId>,
  ): StateReturn[] {
    const cancelled = this.#cancelActiveTimer(data.timeoutId)

    if (!cancelled) {
      return []
    }

    return [
      timerCancelled({ timeoutId: data.timeoutId, delay: cancelled.delay }),
    ]
  }

  #handleRestartTimer<TimeoutId extends string>(
    data: RestartTimerEffectData<TimeoutId>,
  ): StateReturn[] {
    const cancelled = this.#cancelActiveTimer(data.timeoutId)

    return [
      ...(cancelled
        ? [
            timerCancelled({
              timeoutId: data.timeoutId,
              delay: cancelled.delay,
            }),
          ]
        : []),
      ...this.#handleStartTimer(data),
    ]
  }

  #handleStartInterval<IntervalId extends string>(
    data: StartIntervalEffectData<IntervalId>,
  ): StateReturn[] {
    this.#replaceInterval(data.intervalId)

    const token = this.#timerCounter++
    const handle = this.#timerDriver.startInterval(data.delay, async () => {
      const activeInterval = this.#intervals.get(data.intervalId)

      if (activeInterval?.token !== token) {
        return
      }

      await this.run(intervalTriggered(data))
    })

    this.#intervals.set(data.intervalId, {
      delay: data.delay,
      handle,
      token,
    })

    return [intervalStarted(data)]
  }

  #handleCancelInterval<IntervalId extends string>(
    data: CancelIntervalEffectData<IntervalId>,
  ): StateReturn[] {
    const cancelled = this.#cancelActiveInterval(data.intervalId)

    if (!cancelled) {
      return []
    }

    return [
      intervalCancelled({
        intervalId: data.intervalId,
        delay: cancelled.delay,
      }),
    ]
  }

  #handleRestartInterval<IntervalId extends string>(
    data: RestartIntervalEffectData<IntervalId>,
  ): StateReturn[] {
    const cancelled = this.#cancelActiveInterval(data.intervalId)

    return [
      ...(cancelled
        ? [
            intervalCancelled({
              intervalId: data.intervalId,
              delay: cancelled.delay,
            }),
          ]
        : []),
      ...this.#handleStartInterval(data),
    ]
  }

  #handleStartFrame(): StateReturn[] {
    this.#replaceFrame()

    const token = this.#timerCounter++
    const handle = this.#timerDriver.startFrame(async timestamp => {
      if (this.#frame?.token !== token) {
        return
      }

      await this.run(onFrame(timestamp))
    })

    this.#frame = {
      handle,
      token,
    }

    return []
  }

  #handleCancelFrame(): StateReturn[] {
    this.#cancelActiveFrame()

    return []
  }

  #cancelActiveAsync(asyncId: string): boolean {
    const activeAsync = this.#asyncOperations.get(asyncId)

    if (!activeAsync) {
      return false
    }

    activeAsync.controller.abort()
    this.#asyncDriver.cancel(activeAsync.handle)
    this.#asyncOperations.delete(asyncId)

    return true
  }

  #cancelActiveTimer(timeoutId: string): TimerPayload<string> | undefined {
    const activeTimer = this.#timers.get(timeoutId)

    if (!activeTimer) {
      return
    }

    this.#timerDriver.cancel(activeTimer.handle)
    this.#timers.delete(timeoutId)

    return {
      timeoutId,
      delay: activeTimer.delay,
    }
  }

  #replaceTimer(timeoutId: string) {
    const activeTimer = this.#timers.get(timeoutId)

    if (!activeTimer) {
      return
    }

    this.#timerDriver.cancel(activeTimer.handle)
    this.#timers.delete(timeoutId)
  }

  #replaceAsync(asyncId: string) {
    this.#cancelActiveAsync(asyncId)
  }

  #cancelActiveInterval(
    intervalId: string,
  ): IntervalPayload<string> | undefined {
    const activeInterval = this.#intervals.get(intervalId)

    if (!activeInterval) {
      return
    }

    this.#timerDriver.cancel(activeInterval.handle)
    this.#intervals.delete(intervalId)

    return {
      intervalId,
      delay: activeInterval.delay,
    }
  }

  #replaceInterval(intervalId: string) {
    const activeInterval = this.#intervals.get(intervalId)

    if (!activeInterval) {
      return
    }

    this.#timerDriver.cancel(activeInterval.handle)
    this.#intervals.delete(intervalId)
  }

  #cancelActiveFrame() {
    if (!this.#frame) {
      return
    }

    this.#timerDriver.cancel(this.#frame.handle)
    this.#frame = undefined
  }

  #replaceFrame() {
    this.#cancelActiveFrame()
  }

  #clearTimers() {
    this.#timers.forEach(timer => {
      this.#timerDriver.cancel(timer.handle)
    })

    this.#intervals.forEach(interval => {
      this.#timerDriver.cancel(interval.handle)
    })

    if (this.#frame) {
      this.#timerDriver.cancel(this.#frame.handle)
    }

    this.#timers.clear()
    this.#intervals.clear()
    this.#frame = undefined
  }

  #clearAsync() {
    this.#asyncOperations.forEach(activeAsync => {
      activeAsync.controller.abort()
      this.#asyncDriver.cancel(activeAsync.handle)
    })

    this.#asyncOperations.clear()
  }

  #isAbortError(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted) {
      return true
    }

    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    )
  }

  async #runAsyncOperation<Resolved>(
    run: StartAsyncEffectData<Resolved, string>["run"],
    signal: AbortSignal,
  ): Promise<Resolved> {
    try {
      return typeof run === "function"
        ? await run(signal, this.context)
        : await run
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  async #executeAction<A extends RuntimeAction>(
    action: A,
  ): Promise<StateReturn[]> {
    const targetState = this.context.currentState

    if (!targetState) {
      throw new MissingCurrentState("Must provide a current state")
    }

    const result = await targetState.executor(action, this)

    return arraySingleton(result)
  }

  #handleState(targetState: RuntimeState): StateReturn[] {
    const exitState = this.context.currentState

    if (exitState) {
      this.#clearAsync()
    }

    const isUpdating =
      exitState?.name === targetState.name && targetState.mode === "update"

    return isUpdating
      ? this.#updateState(targetState)
      : this.#enterState(targetState)
  }

  #updateState(targetState: RuntimeState): StateReturn[] {
    return [
      // Update history
      effect("nextState", targetState, () => {
        this.context.history.pop()
        this.context.history.push(
          targetState as typeof this.context.currentState,
        )
        this.#contextDidChange()
      }),

      // Add a log effect.
      log(`Update: ${targetState.name}`, targetState.data),
    ]
  }

  #enterState(targetState: RuntimeState): StateReturn[] {
    const exitState = this.context.currentState

    if (exitState && exitState.name !== targetState.name) {
      this.#clearTimers()
    }

    const effects: StateReturn[] = [
      // Update history
      effect("nextState", targetState, () =>
        this.context.history.push(
          targetState as typeof this.context.currentState,
        ),
      ),

      // Add a log effect.
      log(`Enter: ${targetState.name}`, targetState.data),

      // Run enter on next state
      beforeEnter(this),

      // Run enter on next state
      enter(),
    ]

    // Run exit on prior state first
    if (exitState) {
      effects.unshift(exit())
    }

    return effects
  }

  #handleGoBack(): StateReturn[] {
    this.#clearAsync()
    this.#clearTimers()

    return [
      // Update history
      effect("updateHistory", undefined, () => {
        this.context.history.pop()
      }),

      beforeEnter(this),

      enter(),
    ]
  }
}

export const createRuntime = <
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>(
  context: Context,
  internalActions: AM = {} as AM,
  outputActions: OAM = {} as OAM,
  options?: RuntimeOptions,
) => new Runtime(context, internalActions, outputActions, options)
