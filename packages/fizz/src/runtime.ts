import { beforeEnter, enter } from "./action.js"
import type { RuntimeBrowserDriver } from "./browser/runtimeBrowserDriver.js"
import type { Context } from "./context.js"
import { createInitialContext } from "./context.js"
import type { MachineDefinition } from "./createMachine.js"
import type { Effect } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
import type { RuntimeAsyncDriver } from "./runtime/asyncDriver.js"
import { createDefaultAsyncDriver } from "./runtime/asyncDriver.js"
import type { RuntimeEffectHandlerRegistry } from "./runtime/effectDispatcher.js"
import { dispatchEffect } from "./runtime/effectDispatcher.js"
import type { RuntimeCommandHandlers } from "./runtime/runtimeCommandModule.js"
import type { SelectorWhen, StateSelector } from "./selectors.js"
import { runStateSelector } from "./selectors.js"
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
  actionCommand,
  commandsFromStateReturns,
  effectCommand,
  toRuntimeCommand,
} from "./runtime/runtimeCommandFactory.js"
import type { ContextChangeSubscriber } from "./runtime/runtimeContextManager.js"
import { RuntimeContextManager } from "./runtime/runtimeContextManager.js"
import type {
  RuntimeAction,
  RuntimeAssertCleanTeardownOptions,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeDiagnosticsSnapshot,
  RuntimeMonitor,
  RuntimeState,
} from "./runtime/runtimeContracts.js"
import type { RuntimeModuleSet } from "./runtime/runtimeModules.js"
import { createRuntimeModules } from "./runtime/runtimeModules.js"
import type {
  OutputChannelHandlers,
  OutputSubscriber,
  RuntimeOutputAction,
} from "./runtime/runtimeOutputRouter.js"
import { RuntimeOutputRouter } from "./runtime/runtimeOutputRouter.js"
import type { RuntimeQueueItem } from "./runtime/runtimeQueue.js"
import { queueItemsFromCommands } from "./runtime/runtimeQueue.js"
import type { RuntimeQueueController } from "./runtime/runtimeQueueController.js"
import { createRuntimeQueueController } from "./runtime/runtimeQueueController.js"
import { processRuntimeQueueHead } from "./runtime/runtimeQueueRunner.js"
import type { RuntimeTimerDriver } from "./runtime/timerDriver.js"
import { createDefaultTimerDriver } from "./runtime/timerDriver.js"
import {
  buildGoBackCommands,
  buildStateTransitionCommands,
} from "./runtime/transitions.js"
import { arraySingleton } from "./util.js"

export type { RuntimeBrowserDriver } from "./browser/runtimeBrowserDriver.js"
export type {
  ControlledAsyncDriver,
  RuntimeAsyncDriver,
} from "./runtime/asyncDriver.js"
export { createControlledAsyncDriver } from "./runtime/asyncDriver.js"
export type { RuntimeCommandLineage } from "./runtime/runtimeCommandLineage.js"
export {
  createChildRuntimeCommandLineage,
  createRootRuntimeCommandLineage,
} from "./runtime/runtimeCommandLineage.js"
export type {
  RuntimeCommandHandlers,
  RuntimeCommandHandlersFromClients,
} from "./runtime/runtimeCommandModule.js"
export { commandHandlersFromClients } from "./runtime/runtimeCommandModule.js"
export type {
  RuntimeAssertCleanTeardownOptions,
  RuntimeDebugCancellationReason,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeDebugResourceReleaseReason,
  RuntimeDiagnosticsSnapshot,
  RuntimeMissingCommandHandlerPolicy,
  RuntimeMonitor,
} from "./runtime/runtimeContracts.js"
export type {
  ControlledTimerDriver,
  RuntimeTimerDriver,
} from "./runtime/timerDriver.js"
export { createControlledTimerDriver } from "./runtime/timerDriver.js"

export type RuntimeOptions = {
  asyncDriver?: RuntimeAsyncDriver
  browserDriver?: RuntimeBrowserDriver
  commandHandlers?: RuntimeCommandHandlers
  commandMissingHandler?: "error" | "noop" | "warn"
  clients?: Record<string, unknown>
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

type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => RuntimeAction
}
type RuntimeStateMap = {
  [key: string]: (...args: Array<any>) => RuntimeState
}
type RuntimeMachineSelectors<States extends RuntimeStateMap> = Record<
  string,
  StateSelector<
    States[keyof States] | ReadonlyArray<States[keyof States]>,
    unknown
  >
>
type PromiseBoundActions<AM extends RuntimeActionMap> = {
  [K in keyof AM]: (...args: Parameters<AM[K]>) => {
    asPromise: () => Promise<void>
  }
}

export class Runtime<
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> {
  readonly #asyncDriver: RuntimeAsyncDriver
  readonly clients: Record<string, unknown>
  readonly #contextManager: RuntimeContextManager
  readonly #disconnectSubscribers = new Set<() => void>()
  readonly #effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
  readonly #modules: RuntimeModuleSet
  readonly #monitors = new Set<RuntimeMonitor>()
  readonly #outputRouter: RuntimeOutputRouter<OAM>
  readonly #queueController: RuntimeQueueController<RuntimeDebugCommand>
  readonly #validActions: Set<string>
  readonly #timerDriver: RuntimeTimerDriver

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
    this.clients = options.clients ?? {}
    this.#contextManager = new RuntimeContextManager(
      context.currentState as RuntimeState | undefined,
    )
    this.#outputRouter = new RuntimeOutputRouter<OAM>()
    this.#queueController = createRuntimeQueueController<RuntimeDebugCommand>()
    this.#timerDriver = options.timerDriver ?? createDefaultTimerDriver()

    if (options.monitor) {
      this.#monitors.add(options.monitor)
    }

    this.#modules = createRuntimeModules<ReturnType<OAM[keyof OAM]>>({
      actionCommand,
      asyncDriver: this.#asyncDriver,
      ...(options.browserDriver === undefined
        ? {}
        : { browserDriver: options.browserDriver }),
      currentState: () => this.context.currentState as RuntimeState | undefined,
      ...(options.debugLabel === undefined
        ? {}
        : { debugLabel: options.debugLabel }),
      commandHandlers: options.commandHandlers ?? {},
      emitMonitor: event => this.#emitMonitor(event),
      emitOutput: output => {
        this.#emitMonitor({
          output,
          type: "output-emitted",
        })

        void this.#outputRouter.emit(output)
      },
      getContext: () => this.context,
      handleGoBack: () => this.#handleGoBack(),
      missingCommandHandlerPolicy: options.commandMissingHandler ?? "noop",
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
    return this.#contextManager.onContextChange(fn)
  }

  onOutput(fn: OutputSubscriber<OAM>): () => void {
    return this.#outputRouter.onOutput(fn)
  }

  onOutputType<OA extends ReturnType<OAM[keyof OAM]>, T extends OA["type"]>(
    type: T,
    handler: (
      payload: Extract<OA, { type: T }>["payload"],
    ) => void | Promise<void>,
  ): () => void {
    return this.#outputRouter.onOutputType(type, handler)
  }

  connectOutputChannel<
    Handlers extends OutputChannelHandlers<RuntimeOutputAction<OAM>>,
  >(handlers: Handlers): () => void {
    return this.#outputRouter.connectOutputChannel(handlers)
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
    this.#contextManager.disconnect()
    this.#outputRouter.disconnect()
    this.#queueController.disconnect()

    this.#disconnectSubscribers.forEach(disconnect => {
      disconnect()
    })
    this.#disconnectSubscribers.clear()
  }

  getDiagnosticsSnapshot(): RuntimeDiagnosticsSnapshot {
    return this.#modules.getDiagnostics()
  }

  assertCleanTeardown(options: RuntimeAssertCleanTeardownOptions = {}): void {
    const diagnostics = this.getDiagnosticsSnapshot()
    const allow = options.allow ?? {}

    const failingBuckets = (
      Object.keys(diagnostics) as Array<keyof RuntimeDiagnosticsSnapshot>
    )
      .filter(bucket => allow[bucket] !== true)
      .filter(bucket => diagnostics[bucket].length > 0)

    if (failingBuckets.length === 0) {
      return
    }

    const details = failingBuckets
      .map(bucket => {
        const entries = diagnostics[bucket]

        return `${bucket}: ${entries.length} active (${JSON.stringify(entries.slice(0, 5))})`
      })
      .join("; ")

    throw new Error(`Runtime teardown is not clean. ${details}`)
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
      const queueSize = this.#queueController.enqueue({
        onComplete: resolve,
        onError: reject,
        item: toRuntimeCommand(action),
      })

      this.#emitMonitor({
        action,
        queueSize,
        type: "action-enqueued",
      })
    })

    if (this.#queueController.canStartProcessing()) {
      this.#queueController.startProcessing()
      void this.#processQueueHead()
    }

    await promise

    this.#contextDidChange()
  }

  async runAndSelect<W extends SelectorWhen, R>(
    action: RuntimeAction,
    selector: StateSelector<W, R>,
  ): Promise<R | undefined>

  async runAndSelect<R>(
    action: RuntimeAction,
    select: (state: RuntimeState, context: Context) => R,
  ): Promise<R>

  async runAndSelect<W extends SelectorWhen, R>(
    action: RuntimeAction,
    selectOrSelector:
      | StateSelector<W, R>
      | ((state: RuntimeState, context: Context) => R),
  ): Promise<R | undefined> {
    await this.run(action)

    const currentState = this.currentState()

    if (typeof selectOrSelector === "function") {
      return selectOrSelector(currentState, this.context)
    }

    return runStateSelector(selectOrSelector, currentState, this.context)
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
        this.#queueController.stopProcessing()
      },
      onRuntimeError: (command, error) => {
        this.#emitMonitor({
          command,
          error,
          type: "runtime-error",
        })
      },
      processNext: () => this.#processQueueHead(),
      queue: this.#queueController.getQueue(),
      stopOnError: () => {
        this.#queueController.stopProcessing()
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
    this.#emitMonitor({
      context: this.context,
      currentState: this.currentState(),
      previousState: this.#contextManager.getPreviousContextState(),
      type: "context-changed",
    })

    this.#contextManager.notifyContextChanged(this.context)
  }

  #emitMonitor(event: RuntimeDebugEvent) {
    this.#monitors.forEach(monitor => {
      monitor(event)
    })
  }

  #validateCurrentState() {
    this.#contextManager.validateCurrentState(this.context)
  }

  #runEffect(effectItem: Effect<unknown>) {
    effectItem.executor(this.context)
  }

  async #executeAction<A extends RuntimeAction>(
    action: A,
  ): Promise<RuntimeDebugCommand[]> {
    if (
      action.type === enter.type &&
      !this.#queueController.hasEnteredInitialState()
    ) {
      this.#queueController.markEnteredInitialState()

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

  if (options.browserDriver) {
    runtime.browserDriver = options.browserDriver
  }

  if (options.commandHandlers) {
    runtime.commandHandlers = options.commandHandlers
  }

  if (options.commandMissingHandler) {
    runtime.commandMissingHandler = options.commandMissingHandler
  }

  if (options.clients) {
    runtime.clients = options.clients
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
  Selectors extends RuntimeMachineSelectors<SM> = Record<string, never>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, Selectors, Clients>,
  initialState: ReturnType<SM[keyof SM]>,
  options?: CreateRuntimeOptions & { clients?: Clients },
): Runtime<AM, OAM>

export function createRuntime<
  SM extends RuntimeStateMap,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
  Selectors extends RuntimeMachineSelectors<SM> = Record<string, never>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, Selectors, Clients>,
  initialState: ReturnType<SM[keyof SM]>,
  options?: CreateRuntimeOptions & { clients?: Clients },
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
    (machine.outputActions ?? machine.outputs ?? {}) as OAM,
    machine.name === undefined
      ? runtime
      : {
          ...runtime,
          debugLabel: machine.name,
        },
  )
}
