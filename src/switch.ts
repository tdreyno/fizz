import type {
  StateTransition,
  StateTransitionToBoundStateFn,
  GetStateData,
} from "./core.js"

class Matcher<S extends StateTransition<string, any, any>, T> {
  private handlers = new Map<
    StateTransitionToBoundStateFn<S>,
    (data: any) => T
  >()

  constructor(private state: S) {}

  case_<S2 extends StateTransitionToBoundStateFn<S>>(
    state: S2,
    handler: (data: GetStateData<S2>) => T,
  ) {
    this.handlers.set(state, handler)
    return this
  }

  run(): T | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const handler = this.handlers.get(this.state.state)

    if (!handler) {
      return
    }

    return handler(this.state.data)
  }
}

export const switch_ = <T>(state: StateTransition<string, any, any>) =>
  new Matcher<typeof state, T>(state)
