import type { Action } from "./action.js"
import { beforeEnter, enter, exit, isAction } from "./action.js"
import type { Context } from "./context.js"
import type { Effect } from "./effect.js"
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

export class Runtime<
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> {
  readonly #contextChangeSubscribers = new Set<ContextChangeSubscriber>()
  readonly #outputSubscribers = new Set<OutputSubscriber<OAM>>()
  readonly #validActions: Set<string>
  #queue: QueueItem[] = []
  #isRunning = false

  constructor(
    public context: Context,
    public internalActions: AM,
    public outputActions: OAM,
  ) {
    this.#validActions = Object.keys(internalActions).reduce(
      (sum, action) => sum.add(action.toLowerCase()),
      new Set<string>(),
    )
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
      let results: StateReturn[] = []

      if (isAction(item)) {
        results = await this.#executeAction(item)
      } else if (isStateTransition(item)) {
        results = this.#handleState(item)
      } else if (isEffect(item)) {
        if (item.label === "goBack") {
          results = this.#handleGoBack()
        } else if (item.label === "output") {
          this.#outputSubscribers.forEach(sub => {
            void sub(item.data as ReturnType<OAM[keyof OAM]>)
          })
        } else {
          this.#runEffect(item)
        }
      } else {
        // Should be impossible to get here with TypeScript,
        // but could happen with plain JS.
        throw new UnknownStateReturnType(item)
      }

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
) => new Runtime(context, internalActions, outputActions)
