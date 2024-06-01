import type { StateTransition } from "./state.js"

export class History<
  T extends StateTransition<any, any, any> = StateTransition<any, any, any>,
> {
  constructor(
    private items: Array<T>,
    private maxHistory = Infinity,
  ) {
    if (items.length <= 0) {
      throw new Error(
        "History must contain atleast one previous (or initial) state",
      )
    }
  }

  get current(): T {
    return this.items[0]!
  }

  get previous(): T | undefined {
    return this.items[1]
  }

  get length(): number {
    return this.items.length
  }

  push(item: T): void {
    this.items.unshift(item)

    if (this.items.length > this.maxHistory) {
      this.items = this.items.slice(0, this.maxHistory)
    }
  }

  pop(): T | undefined {
    return this.items.shift()
  }

  toArray(): Array<T> {
    return this.items
  }
}

interface Options {
  maxHistory: number
  enableLogging: boolean
  customLogger?:
    | undefined
    | ((msgs: Array<any>, level: "error" | "warn" | "log") => void)
}

export class Context {
  constructor(
    public history: History,
    private options_: Omit<Options, "maxHistory">,
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

export const createInitialContext = (
  history: Array<StateTransition<any, any, any>> = [],
  options?: Partial<Options>,
) =>
  new Context(new History(history, options?.maxHistory ?? Infinity), {
    enableLogging: options?.enableLogging ?? false,
    customLogger: options?.customLogger,
  })
