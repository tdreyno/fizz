import type { Context } from "../context.js"
import type { RuntimeState } from "./runtimeContracts.js"

export type ContextChangeSubscriber = (context: Context) => void

/**
 * Manages context state transitions and notifies subscribers of context changes.
 * Separates context mutation logic from queue orchestration.
 *
 * @internal
 */
export class RuntimeContextManager {
  readonly #contextChangeSubscribers = new Set<ContextChangeSubscriber>()
  #lastContextState: RuntimeState | undefined
  #previousContextState: RuntimeState | undefined

  constructor(initialState: RuntimeState | undefined) {
    this.#lastContextState = initialState
  }

  onContextChange(fn: ContextChangeSubscriber): () => void {
    this.#contextChangeSubscribers.add(fn)
    return () => this.#contextChangeSubscribers.delete(fn)
  }

  notifyContextChanged(context: Context): void {
    const currentState = context.currentState as RuntimeState | undefined

    this.#contextChangeSubscribers.forEach(sub => sub(context))
    this.#previousContextState = this.#lastContextState
    this.#lastContextState = currentState
  }

  getPreviousContextState(): RuntimeState | undefined {
    return this.#previousContextState
  }

  validateCurrentState(context: Context): RuntimeState | undefined {
    const currentState = context.currentState as RuntimeState | undefined

    if (!currentState) {
      throw new Error(
        `Fizz could not find current state to run action on. History: ${JSON.stringify(
          context.history
            .toArray()
            .map(({ name }) => name)
            .join(" -> "),
        )}`,
      )
    }

    return currentState
  }

  disconnect(): void {
    this.#contextChangeSubscribers.clear()
  }
}
