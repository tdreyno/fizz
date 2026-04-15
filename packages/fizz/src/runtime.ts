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
  timerDriver?: RuntimeTimerDriver
}

type ContextChangeSubscriber = (context: Context) => void
type RuntimeAction = Action<string, unknown>
type RuntimeState = StateTransition<string, Action<string, unknown>, unknown>
type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => RuntimeAction
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

type RuntimeCommand =
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

type QueueItem = {
  onComplete: () => void
  onError: (e: unknown) => void
  item: RuntimeCommand
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
  #hasEnteredInitialState = false
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

    try {
      const commands = await this.#executeCommand(item)
      const { promise, items } = this.#commandsToQueueItems(commands)

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

  async #executeCommand(item: QueueItem["item"]): Promise<RuntimeCommand[]> {
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

  #toCommand(item: RuntimeQueueValue): RuntimeCommand {
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

  #actionCommand(action: RuntimeAction): RuntimeCommand {
    return {
      action,
      kind: "action",
    }
  }

  #stateCommand(state: RuntimeState): RuntimeCommand {
    return {
      kind: "state",
      state,
    }
  }

  #effectCommand(effectValue: Effect<unknown>): RuntimeCommand {
    return {
      effect: effectValue,
      kind: "effect",
    }
  }

  #handleEffectItem(item: Effect<unknown>): RuntimeCommand[] {
    return dispatchEffect<RuntimeCommand, ReturnType<OAM[keyof OAM]>>(item, {
      emitOutput: output => {
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
    })
  }

  #stateReturnsToCommands(stateReturns: StateReturn[]): RuntimeCommand[] {
    return stateReturns.map(item => this.#toCommand(item))
  }

  #commandsToQueueItems(commands: RuntimeCommand[]): {
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

  #runEffect(effectItem: Effect<unknown>) {
    effectItem.executor(this.context)
  }

  #handleStartAsync<Resolved>(
    data: StartAsyncEffectData<Resolved, string>,
  ): RuntimeCommand[] {
    const asyncId = data.asyncId ?? `__fizz_async__${this.#asyncIdCounter++}`

    startAsyncOperation({
      asyncDriver: this.#asyncDriver,
      asyncId,
      asyncOperations: this.#asyncOperations,
      createController: () => new AbortController(),
      data,
      isAbortError,
      nextToken: () => this.#asyncCounter++,
      run: action => this.run(action),
      runAsyncOperation: (run, signal) =>
        runAsyncOperation(this.context, run, signal),
    })

    return []
  }

  #handleCancelAsync<AsyncId extends string>(
    data: CancelAsyncEffectData<AsyncId>,
  ): RuntimeCommand[] {
    const cancelled = cancelActiveAsyncOperation({
      asyncDriver: this.#asyncDriver,
      asyncId: data.asyncId,
      asyncOperations: this.#asyncOperations,
    })

    return cancelled
      ? [this.#actionCommand(asyncCancelled({ asyncId: data.asyncId }))]
      : []
  }

  #handleStartTimer<TimeoutId extends string>(
    data: StartTimerEffectData<TimeoutId>,
  ): RuntimeCommand[] {
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
        await this.run(timerCompleted(data))
      },
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    return [this.#actionCommand(timerStarted(data))]
  }

  #handleCancelTimer<TimeoutId extends string>(
    data: CancelTimerEffectData<TimeoutId>,
  ): RuntimeCommand[] {
    const cancelled = cancelActiveTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    if (!cancelled) {
      return []
    }

    return [
      this.#actionCommand(
        timerCancelled({ timeoutId: data.timeoutId, delay: cancelled.delay }),
      ),
    ]
  }

  #handleRestartTimer<TimeoutId extends string>(
    data: RestartTimerEffectData<TimeoutId>,
  ): RuntimeCommand[] {
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
  ): RuntimeCommand[] {
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

        await this.run(intervalTriggered(data))
      },
      timerDriver: this.#timerDriver,
    })

    return [this.#actionCommand(intervalStarted(data))]
  }

  #handleCancelInterval<IntervalId extends string>(
    data: CancelIntervalEffectData<IntervalId>,
  ): RuntimeCommand[] {
    const cancelled = cancelActiveIntervalOperation({
      intervalId: data.intervalId,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
    })

    if (!cancelled) {
      return []
    }

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
  ): RuntimeCommand[] {
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

  #handleStartFrame(): RuntimeCommand[] {
    this.#cancelActiveFrame()

    this.#frame = startFrameOperation({
      nextToken: () => this.#timerCounter++,
      onFrame: async (timestamp, token) => {
        if (this.#frame?.token !== token) {
          return
        }

        await this.run(onFrame(timestamp))
      },
      timerDriver: this.#timerDriver,
    })

    return []
  }

  #handleCancelFrame(): RuntimeCommand[] {
    this.#cancelActiveFrame()

    return []
  }

  #cancelActiveFrame() {
    cancelActiveFrameOperation({
      frame: this.#frame,
      timerDriver: this.#timerDriver,
    })

    this.#frame = undefined
  }

  #clearTimers() {
    clearScheduledOperations({
      frame: this.#frame,
      intervals: this.#intervals,
      timerDriver: this.#timerDriver,
      timers: this.#timers,
    })

    this.#frame = undefined
  }

  #clearAsync() {
    clearAsyncOperations({
      asyncDriver: this.#asyncDriver,
      asyncOperations: this.#asyncOperations,
    })
  }

  async #executeAction<A extends RuntimeAction>(
    action: A,
  ): Promise<RuntimeCommand[]> {
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

  #handleState(targetState: RuntimeState): RuntimeCommand[] {
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

  #handleGoBack(): RuntimeCommand[] {
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

export const createRuntime = <
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>(
  context: Context,
  internalActions: AM = {} as AM,
  outputActions: OAM = {} as OAM,
  options?: RuntimeOptions,
) => new Runtime(context, internalActions, outputActions, options)
