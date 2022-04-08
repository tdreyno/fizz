import { Effect } from "./effect.js"
import { StateReturn } from "./state.js"
import { arraySingleton } from "./util.js"

class ExecuteResult_ {
  constructor(
    public effects: Array<Effect>,
    public promises: Array<Promise<void | StateReturn | Array<StateReturn>>>,
  ) {}

  concat({ effects, promises }: ExecuteResult) {
    return ExecuteResult(
      this.effects.concat(effects),
      this.promises.concat(promises),
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

  pushPromise(promise: Promise<void | StateReturn | Array<StateReturn>>) {
    this.promises.push(promise)
    return this
  }
}

export const ExecuteResult = (
  effects: Effect | Array<Effect> = [],
  promises: Array<Promise<void | StateReturn | Array<StateReturn>>> = [],
) => new ExecuteResult_(arraySingleton(effects), promises)
export type ExecuteResult = ExecuteResult_

export const isExecuteResult = (value: unknown): value is ExecuteResult =>
  value instanceof ExecuteResult_

export const executeResultfromPromise = (
  promise: Promise<void | StateReturn | Array<StateReturn>>,
) => ExecuteResult([], [promise])
