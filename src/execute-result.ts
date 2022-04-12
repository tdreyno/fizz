import type { Effect } from "./effect.js"
import type { StateReturn } from "./state.js"
import { arraySingleton } from "./util.js"

class ExecuteResult_ {
  constructor(
    public effects: Array<Effect>,
    public futures: Array<
      () => Promise<void | StateReturn | Array<StateReturn>>
    >,
  ) {}

  concat({ effects, futures }: ExecuteResult) {
    return ExecuteResult(
      this.effects.concat(effects),
      this.futures.concat(futures),
    )
  }

  pushEffect(effect: Effect) {
    this.effects.push(effect)
    return this
  }

  prependEffect(effect: Effect) {
    this.effects.unshift(effect)
    return this
  }

  pushFuture(future: () => Promise<void | StateReturn | Array<StateReturn>>) {
    this.futures.push(future)
    return this
  }
}

export const ExecuteResult = (
  effects: Effect | Array<Effect> = [],
  promises: Array<() => Promise<void | StateReturn | Array<StateReturn>>> = [],
) => new ExecuteResult_(arraySingleton(effects), promises)
export type ExecuteResult = ExecuteResult_

export const isExecuteResult = (value: unknown): value is ExecuteResult =>
  value instanceof ExecuteResult_

export const executeResultfromPromise = (
  promise: Promise<void | StateReturn | Array<StateReturn>>,
) => ExecuteResult([], [() => promise])
