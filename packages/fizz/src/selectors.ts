import type { Context } from "./context.js"
import type { BoundStateFn, StateTransition } from "./state.js"

export type AnyStateSelectorCreator = BoundStateFn<any, any, any>

export type SelectorWhen =
  | AnyStateSelectorCreator
  | ReadonlyArray<AnyStateSelectorCreator>

type StateFromSelectorWhen<W extends SelectorWhen> =
  W extends ReadonlyArray<infer S>
    ? S extends AnyStateSelectorCreator
      ? ReturnType<S>
      : never
    : W extends AnyStateSelectorCreator
      ? ReturnType<W>
      : never

type StateDataFromSelectorWhen<W extends SelectorWhen> =
  StateFromSelectorWhen<W> extends { data: infer D } ? D : never

type SelectorResolver<W extends SelectorWhen, R> = (
  data: StateDataFromSelectorWhen<W>,
  state: StateFromSelectorWhen<W>,
  context: Context,
) => R

type SelectorMatcher<W extends SelectorWhen> = Partial<
  StateDataFromSelectorWhen<W>
>

export interface StateSelectorOptions<R> {
  equalityFn?: (previous: R | undefined, next: R | undefined) => boolean
}

export interface StateSelector<W extends SelectorWhen, R> {
  when: W
  select: (
    data: StateDataFromSelectorWhen<W>,
    state: StateFromSelectorWhen<W>,
    context: Context,
  ) => R
  equalityFn?: (previous: R | undefined, next: R | undefined) => boolean
  isMatcher?: boolean
}

export function selectWhen<W extends SelectorWhen, R>(
  when: W,
  select: SelectorResolver<W, R>,
  options?: StateSelectorOptions<R>,
): StateSelector<W, R | undefined>

export function selectWhen<W extends SelectorWhen>(
  when: W,
  matcher: SelectorMatcher<W>,
  options?: StateSelectorOptions<boolean>,
): StateSelector<W, boolean>

export function selectWhen<W extends SelectorWhen, R>(
  when: W,
  selectOrMatcher: SelectorResolver<W, R> | SelectorMatcher<W>,
  options?: StateSelectorOptions<R> | StateSelectorOptions<boolean>,
): StateSelector<W, R | undefined> | StateSelector<W, boolean> {
  if (typeof selectOrMatcher !== "function") {
    const matcher = selectOrMatcher
    const select: StateSelector<W, boolean>["select"] = data => {
      const stateData = data as Record<string, unknown>

      return Object.entries(matcher).every(([key, expectedValue]) =>
        Object.is(stateData[key], expectedValue),
      )
    }
    const equalityFn = (options as StateSelectorOptions<boolean> | undefined)
      ?.equalityFn

    return {
      when,
      select,
      isMatcher: true,
      ...(equalityFn === undefined ? {} : { equalityFn }),
    }
  }

  const select = selectOrMatcher
  const equalityFn = (options as StateSelectorOptions<R> | undefined)
    ?.equalityFn

  return {
    when,
    select,
    isMatcher: false,
    ...(equalityFn === undefined ? {} : { equalityFn }),
  }
}

export const matchesSelectorWhen = <W extends SelectorWhen>(
  state: StateTransition<string, any, unknown>,
  when: W,
): state is StateFromSelectorWhen<W> => {
  if (Array.isArray(when)) {
    return when.some(candidate => state.is(candidate))
  }

  return state.is(when as AnyStateSelectorCreator)
}

export const runStateSelector = <W extends SelectorWhen, R>(
  selector: StateSelector<W, R>,
  state: StateTransition<string, any, unknown>,
  context: Context,
): R | undefined => {
  if (matchesSelectorWhen(state, selector.when)) {
    return selector.select(
      state.data as StateDataFromSelectorWhen<W>,
      state,
      context,
    )
  }

  if (selector.isMatcher === true) {
    return false as R
  }

  return undefined
}
