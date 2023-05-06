import type { StateTransition } from "./core.js"

export class History<
  T extends StateTransition<any, any, any> = StateTransition<any, any, any>,
> {
  constructor(protected items: Array<T>, protected maxHistory = Infinity) {
    if (items.length <= 0) {
      throw new Error(
        "History must contain atleast one previous (or initial) state",
      )
    }
  }

  get current(): T {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
    protected options_: Omit<Options, "maxHistory">,
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

export const createInitialContext = <T extends StateTransition<any, any, any>>(
  history: Array<T> = [],
  options?: Partial<Options>,
) =>
  new Context(new History(history, options?.maxHistory ?? Infinity), {
    enableLogging: options?.enableLogging ?? false,
    customLogger: options?.customLogger,
  })
