import { Effect } from "./effect.js"
import { StateReturn } from "./state.js"
import { Task } from "@tdreyno/pretty-please"
import { arraySingleton } from "./util.js"

class ExecuteResult_ {
  constructor(
    public effects: Array<Effect>,
    public tasks: Array<Task<any, void | StateReturn | Array<StateReturn>>>,
  ) {}

  concat({ effects, tasks }: ExecuteResult) {
    return ExecuteResult(this.effects.concat(effects), this.tasks.concat(tasks))
  }

  pushEffect(effect: Effect) {
    this.effects.push(effect)
    return this
  }

  prependEffect(effect: Effect) {
    this.effects.unshift(effect)
    return this
  }

  pushTask(task: Task<any, void | StateReturn | Array<StateReturn>>) {
    this.tasks.push(task)
    return this
  }
}

export const ExecuteResult = (
  effects: Effect | Array<Effect> = [],
  tasks: Array<Task<any, void | StateReturn | Array<StateReturn>>> = [],
) => new ExecuteResult_(arraySingleton(effects), tasks)
export type ExecuteResult = ExecuteResult_

export const isExecuteResult = (value: unknown): value is ExecuteResult =>
  value instanceof ExecuteResult_

export const executeResultfromTask = (
  task: Task<any, void | StateReturn | Array<StateReturn>>,
) => ExecuteResult([], [task])
