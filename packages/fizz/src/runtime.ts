import { beforeEnter, enter } from "./action.js"
import type { Context } from "./context.js"
import { createInitialContext } from "./context.js"
import type { MachineDefinition } from "./createMachine.js"
import type { Effect } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
import type { RuntimeAsyncDriver } from "./runtime/asyncDriver.js"
import { createDefaultAsyncDriver } from "./runtime/asyncDriver.js"
import type { RuntimeEffectHandlerRegistry } from "./runtime/effectDispatcher.js"
import { dispatchEffect } from "./runtime/effectDispatcher.js"
export type {
  RuntimeChromeDebuggerRegistry,
  RuntimeChromeDebuggerRegistryEntry,
} from "./runtime/debugHook.js"
export {
  FIZZ_CHROME_DEBUGGER_REGISTRY_KEY,
  getOrCreateRuntimeChromeDebuggerRegistry,
  getRuntimeChromeDebuggerRegistry,
  listRuntimeChromeDebuggerRegistrations,
} from "./runtime/debugHook.js"
import {
  canQueueStartProcessing,
  createQueueMachine,
  markQueueEnteredInitialState,
  startQueueProcessing,
  stopQueueProcessing,
} from "./runtime/queueMachine.js"
import {
  actionCommand,
  commandsFromStateReturns,
  effectCommand,
  toRuntimeCommand,
} from "./runtime/runtimeCommandFactory.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeMonitor,
  RuntimeState,
} from "./runtime/runtimeContracts.js"
import type { RuntimeModuleSet } from "./runtime/runtimeModules.js"
import { createRuntimeModules } from "./runtime/runtimeModules.js"
import type { RuntimeQueueItem } from "./runtime/runtimeQueue.js"
import { queueItemsFromCommands } from "./runtime/runtimeQueue.js"
import { processRuntimeQueueHead } from "./runtime/runtimeQueueRunner.js"
import type { RuntimeTimerDriver } from "./runtime/timerDriver.js"
import { createDefaultTimerDriver } from "./runtime/timerDriver.js"
import {
  buildGoBackCommands,
  buildStateTransitionCommands,
} from "./runtime/transitions.js"
import { arraySingleton } from "./util.js"

export type {
  ControlledAsyncDriver,
  RuntimeAsyncDriver,
} from "./runtime/asyncDriver.js"
export { createControlledAsyncDriver } from "./runtime/asyncDriver.js"
export type {
  RuntimeDebugCancellationReason,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeMonitor,
} from "./runtime/runtimeContracts.js"
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

export class Runtime<
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> {
  readonly #asyncDriver: RuntimeAsyncDriver
  readonly #contextChangeSubscribers = new Set<ContextChangeSubscriber>()
  readonly #disconnectSubscribers = new Set<() => void>()
  readonly #effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
  #lastContextState: RuntimeState | undefined
  readonly #modules: RuntimeModuleSet
  readonly #monitors = new Set<RuntimeMonitor>()
  readonly #outputSubscribers = new Set<OutputSubscriber<OAM>>()
  readonly #validActions: Set<string>
  readonly #timerDriver: RuntimeTimerDriver
  #queueMachine = createQueueMachine()
  readonly #queue: RuntimeQueueItem<RuntimeDebugCommand>[] = []

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

    this.#modules = createRuntimeModules<ReturnType<OAM[keyof OAM]>>({
      actionCommand,
      asyncDriver: this.#asyncDriver,
      currentState: () => this.context.currentState as RuntimeState | undefined,
      ...(options.debugLabel === undefined
        ? {}
        : { debugLabel: options.debugLabel }),
      emitMonitor: event => this.#emitMonitor(event),
      emitOutput: output => {
        this.#emitMonitor({
          output,
          type: "output-emitted",
        })

        this.#outputSubscribers.forEach(sub => {
          void sub(output)
        })
      },
      getContext: () => this.context,
      handleGoBack: () => this.#handleGoBack(),
      runAction: action => this.run(action),
      runtime: this as Runtime<any, any>,
      timerDriver: this.#timerDriver,
    })
    this.#effectHandlers = this.#modules.effectHandlers
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
    this.#modules.disconnect()
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
        item: toRuntimeCommand(action),
      })

      this.#emitMonitor({
        action,
        queueSize: this.#queue.length,
        type: "action-enqueued",
      })
    })

    if (canQueueStartProcessing(this.#queueMachine)) {
      this.#queueMachine = startQueueProcessing(this.#queueMachine)
      void this.#processQueueHead()
    }

    await promise

    this.#contextDidChange()
  }

  async #processQueueHead(): Promise<void> {
    await processRuntimeQueueHead({
      executeCommand: item => this.#executeCommand(item),
      onCommandCompleted: (command, generatedCommands) => {
        this.#emitMonitor({
          command,
          generatedCommands,
          type: "command-completed",
        })
      },
      onCommandStarted: (command, queueSize) => {
        this.#validateCurrentState()
        this.#emitMonitor({
          command,
          queueSize,
          type: "command-started",
        })
      },
      onQueueEmpty: () => {
        this.#queueMachine = stopQueueProcessing(this.#queueMachine)
      },
      onRuntimeError: (command, error) => {
        this.#emitMonitor({
          command,
          error,
          type: "runtime-error",
        })
      },
      processNext: () => this.#processQueueHead(),
      queue: this.#queue,
      stopOnError: () => {
        this.#queueMachine = stopQueueProcessing(this.#queueMachine)
      },
      toQueueItems: commands => this.#commandsToQueueItems(commands),
    })
  }

  async #executeCommand(
    item: RuntimeQueueItem<RuntimeDebugCommand>["item"],
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

  #handleEffectItem(item: Effect<unknown>): RuntimeDebugCommand[] {
    return dispatchEffect(item, {
      registry: this.#effectHandlers,
      runEffect: effectItem => this.#runEffect(effectItem),
    })
  }

  #commandsToQueueItems(commands: RuntimeDebugCommand[]): {
    items: RuntimeQueueItem<RuntimeDebugCommand>[]
    promise: Promise<void[]>
  } {
    return queueItemsFromCommands(commands)
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

  async #executeAction<A extends RuntimeAction>(
    action: A,
  ): Promise<RuntimeDebugCommand[]> {
    if (
      action.type === enter.type &&
      !this.#queueMachine.hasEnteredInitialState
    ) {
      this.#queueMachine = markQueueEnteredInitialState(this.#queueMachine)

      return [actionCommand(beforeEnter(this)), actionCommand(action)]
    }

    const targetState = this.context.currentState

    if (!targetState) {
      throw new MissingCurrentState("Must provide a current state")
    }

    const result = await targetState.executor(action, this)

    return commandsFromStateReturns(arraySingleton(result))
  }

  #handleState(targetState: RuntimeState): RuntimeDebugCommand[] {
    return buildStateTransitionCommands({
      actionCommand,
      context: this.context,
      effectCommand,
      notifyContextDidChange: () => this.#contextDidChange(),
      prepareForTransition: nextState =>
        this.#modules.prepareForTransition(nextState),
      runtime: this,
      targetState,
    })
  }

  #handleGoBack(): RuntimeDebugCommand[] {
    return buildGoBackCommands({
      actionCommand,
      context: this.context,
      effectCommand,
      prepareForGoBack: () => this.#modules.prepareForGoBack(),
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
