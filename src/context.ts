/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateTransition } from "./state"

export class History<
  T extends StateTransition<any, any, any> = StateTransition<any, any, any>
> {
  constructor(private items_: Array<T>, private maxHistory = Infinity) {
    if (items_.length <= 0) {
      throw new Error(
        "History must contain atleast one previous (or initial) state",
      )
    }
  }

  get current(): T {
    return this.items_[0]
  }

  get previous(): T | undefined {
    return this.items_[1]
  }

  get length(): number {
    return this.items_.length
  }

  push(item: T): void {
    this.items_.unshift(item)

    if (this.items_.length > this.maxHistory) {
      this.items_ = this.items_.slice(0, this.maxHistory)
    }
  }

  pop(): T | undefined {
    return this.items_.shift()
  }

  removePrevious(): void {
    if (this.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const head = this.pop()!

      this.pop()

      this.push(head)
    }
  }

  toArray(): Array<T> {
    return [...this.items_]
  }

  map<B>(fn: (item: T) => B): Array<B> {
    return this.toArray().map(fn)
  }
}

interface Options {
  maxHistory: number
  allowUnhandled: boolean
  onAsyncEnterExit: "throw" | "warn" | "silent"
  disableLogging: boolean
  customLogger?: (msgs: Array<any>, level: "error" | "warn" | "log") => void
}

export class Context {
  constructor(
    public history: History,
    private options_: Omit<Options, "maxHistory">,
  ) {}

  get allowUnhandled() {
    return this.options_.allowUnhandled
  }

  get onAsyncEnterExit() {
    return this.options_.onAsyncEnterExit
  }

  get disableLogging() {
    return this.options_.disableLogging
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
  new Context(
    new History(history, (options && options.maxHistory) || Infinity),
    {
      allowUnhandled: (options && options.allowUnhandled) || false,
      onAsyncEnterExit: (options && options.onAsyncEnterExit) || "warn",
      disableLogging: (options && options.disableLogging) || false,
      customLogger: (options && options.customLogger) || undefined,
    },
  )
