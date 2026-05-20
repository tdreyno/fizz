import type { StateTransition } from "./state.js"

/**
 * Bounded history of state transitions. Newest item is the "current" state.
 *
 * Internally stores items oldest-first so that pushing the newest state is a
 * simple `items[tail++ % cap] = item` instead of the O(n) `unshift` + `slice`
 * pattern. Public ordering is preserved: `current` is the most recently
 * pushed item, and `toArray()` returns newest-first.
 */
export class History<
  T extends StateTransition<string, any, unknown> = StateTransition<
    string,
    any,
    unknown
  >,
> {
  // Newest item is at logical index `size - 1`.
  readonly #cap: number
  readonly #bounded: boolean
  #items: Array<T | undefined>
  #head = 0 // physical index of the oldest item (only meaningful for bounded)
  #size: number

  constructor(initialItems: Array<T>, maxHistory = Infinity) {
    if (initialItems.length <= 0) {
      throw new Error(
        "History must contain atleast one previous (or initial) state",
      )
    }

    this.#bounded = Number.isFinite(maxHistory)
    this.#cap = maxHistory

    // Public constructor contract: incoming array is newest-first. Flip to
    // oldest-first internal storage so newest sits at logical end.
    const oldestFirst = new Array<T>(initialItems.length)

    for (let index = 0; index < initialItems.length; index += 1) {
      oldestFirst[index] = initialItems[initialItems.length - 1 - index]!
    }

    if (this.#bounded) {
      const take = Math.min(oldestFirst.length, maxHistory)
      const start = oldestFirst.length - take

      this.#items = new Array<T | undefined>(maxHistory)

      for (let index = 0; index < take; index += 1) {
        this.#items[index] = oldestFirst[start + index]!
      }

      this.#head = 0
      this.#size = take
    } else {
      this.#items = oldestFirst
      this.#size = oldestFirst.length
    }
  }

  get current(): T {
    return this.#newest()!
  }

  get previous(): T | undefined {
    if (this.#size < 2) {
      return undefined
    }

    return this.#at(this.#size - 2)
  }

  get length(): number {
    return this.#size
  }

  push(item: T): void {
    if (!this.#bounded) {
      this.#items.push(item)
      this.#size += 1

      return
    }

    if (this.#size < this.#cap) {
      // Write at the next free physical slot (tail).
      const tail = (this.#head + this.#size) % this.#cap

      this.#items[tail] = item
      this.#size += 1

      return
    }

    // At capacity: overwrite oldest slot, advance head.
    this.#items[this.#head] = item
    this.#head = (this.#head + 1) % this.#cap
  }

  pop(): T | undefined {
    if (this.#size === 0) {
      return undefined
    }

    if (!this.#bounded) {
      this.#size -= 1

      return this.#items.pop()
    }

    const tail = (this.#head + this.#size - 1) % this.#cap
    const item = this.#items[tail]

    this.#items[tail] = undefined
    this.#size -= 1

    return item
  }

  /** Returns newest-first snapshot array. */
  toArray(): Array<T> {
    const out = new Array<T>(this.#size)

    for (let index = 0; index < this.#size; index += 1) {
      // Logical newest first: index 0 -> size-1, etc.
      out[index] = this.#at(this.#size - 1 - index)!
    }

    return out
  }

  #newest(): T | undefined {
    if (this.#size === 0) {
      return undefined
    }

    return this.#at(this.#size - 1)
  }

  #at(logicalIndex: number): T | undefined {
    if (!this.#bounded) {
      return this.#items[logicalIndex]
    }

    return this.#items[(this.#head + logicalIndex) % this.#cap]
  }
}

interface Options {
  maxHistory: number
  enableLogging: boolean
  customLogger?:
    | undefined
    | ((msgs: readonly unknown[], level: "error" | "warn" | "log") => void)
}

export class Context {
  constructor(
    public history: History,
    private readonly options_: Omit<Options, "maxHistory">,
  ) {}

  get enableLogging() {
    return this.options_.enableLogging
  }

  get customLogger() {
    return this.options_.customLogger
  }

  get currentState() {
    return this.history.current
  }
}

export const createInitialContext = <
  T extends StateTransition<string, any, any>,
>(
  history: Array<T> = [],
  options?: Partial<Options>,
) =>
  new Context(new History<T>(history, options?.maxHistory ?? Infinity), {
    enableLogging: options?.enableLogging ?? false,
    customLogger: options?.customLogger,
  })
