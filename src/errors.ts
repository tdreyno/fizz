import { Action } from "./action"
import { StateTransition } from "./state"

export class StateDidNotRespondToAction extends Error {
  constructor(
    public state: StateTransition<any, any, any>,
    public action: Action<any, any>,
  ) {
    super()
  }

  toString() {
    return `State "${this.state.name as string}" could not respond to action: ${
      this.action.type as string
    }`
  }
}

export class NoStatesRespondToAction extends Error {
  constructor(
    public states: Array<StateTransition<any, any, any>>,
    public action: Action<any, any>,
  ) {
    super()
  }

  toString() {
    return `The states ${this.states
      .map(s => s.name as string)
      .join(", ")} were unable to respond to action: ${
      this.action.type as string
    }`
  }
}

export class NoMatchingActionTargets extends Error {}

export class MissingCurrentState extends Error {}

export class EnterExitMustBeSynchronous extends Error {}

export class UnknownStateReturnType<
  T extends { toString(): string },
> extends Error {
  constructor(public item: T) {
    super(`Returned an known effect type: ${item.toString()}`)
  }
}
