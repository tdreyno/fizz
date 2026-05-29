import type { Action } from "../action.js"
import type { BoundStateFn, StateTransition } from "../state.js"

export type MatcherEvent =
  | {
      kind: "state"
      state: StateTransition<string, Action<string, unknown>, unknown>
    }
  | { kind: "output"; output: Action<string, unknown> }

export type MatchChannel = "state" | "output"

export type Matcher<T> = {
  readonly channels: ReadonlyArray<MatchChannel>
  evalState: (
    state:
      | StateTransition<string, Action<string, unknown>, unknown>
      | undefined,
  ) => T | undefined
  evalOutput: (output: Action<string, unknown>) => T | undefined
}

export type MatchStateOptions<S extends BoundStateFn<any, any, any>> = {
  where?: (data: ReturnType<S>["data"]) => boolean
}

export const matchState = <S extends BoundStateFn<any, any, any>>(
  stateCtor: S,
  options: MatchStateOptions<S> = {},
): Matcher<ReturnType<S>> => ({
  channels: ["state"],
  evalState: state => {
    if (!state) {
      return undefined
    }

    if (!state.is(stateCtor)) {
      return undefined
    }

    if (options.where && !options.where(state.data as ReturnType<S>["data"])) {
      return undefined
    }

    return state
  },
  evalOutput: () => undefined,
})

type ActionMatcher<T extends string, P> = {
  is(action: Action<string, unknown>): action is Action<T, P>
}

type OutputHandlerEntry<T> =
  | T
  | ((action: Action<string, unknown>) => T | undefined)

type OutputHandlerMap<T> = Record<string, OutputHandlerEntry<T>>

export function matchOutput<T extends string, P>(
  actionCtor: ActionMatcher<T, P>,
): Matcher<Action<T, P>>
export function matchOutput<T>(
  handlers: Record<string, T | ((action: any) => T | undefined)>,
): Matcher<T>
export function matchOutput<T>(
  predicate: (output: Action<string, unknown>) => T | undefined,
): Matcher<T>
export function matchOutput(
  matcher:
    | ActionMatcher<string, unknown>
    | OutputHandlerMap<unknown>
    | ((output: Action<string, unknown>) => unknown),
): Matcher<unknown> {
  if (typeof (matcher as ActionMatcher<string, unknown>).is === "function") {
    const ctor = matcher as ActionMatcher<string, unknown>

    return {
      channels: ["output"],
      evalState: () => undefined,
      evalOutput: output => (ctor.is(output) ? output : undefined),
    }
  }

  if (typeof matcher === "function") {
    const predicate = matcher
    return {
      channels: ["output"],
      evalState: () => undefined,
      evalOutput: output => predicate(output),
    }
  }

  const map = matcher as OutputHandlerMap<unknown>

  return {
    channels: ["output"],
    evalState: () => undefined,
    evalOutput: output => {
      if (!Object.prototype.hasOwnProperty.call(map, output.type)) {
        return undefined
      }

      const entry = map[output.type]

      return typeof entry === "function"
        ? (entry as (action: Action<string, unknown>) => unknown)(output)
        : entry
    },
  }
}

export const matchAny = <T>(
  predicate: (event: MatcherEvent) => T | undefined,
): Matcher<T> => ({
  channels: ["state", "output"],
  evalState: state => (state ? predicate({ kind: "state", state }) : undefined),
  evalOutput: output => predicate({ kind: "output", output }),
})

export const isMatcher = (value: unknown): value is Matcher<unknown> =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Matcher<unknown>).channels) &&
  typeof (value as Matcher<unknown>).evalState === "function" &&
  typeof (value as Matcher<unknown>).evalOutput === "function"

export const coerceStateMatcher = <T>(
  matcher: BoundStateFn<any, any, any> | Matcher<T>,
): Matcher<T> => {
  if (isMatcher(matcher)) {
    return matcher
  }

  return matchState(matcher) as unknown as Matcher<T>
}

export const coerceOutputMatcher = <T>(
  matcher:
    | ActionMatcher<string, unknown>
    | OutputHandlerMap<unknown>
    | ((output: Action<string, unknown>) => unknown)
    | Matcher<T>,
): Matcher<T> => {
  if (isMatcher(matcher)) {
    return matcher as Matcher<T>
  }

  return matchOutput(matcher as never) as unknown as Matcher<T>
}
