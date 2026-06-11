import type { Action } from "./action.js"
import type { StateTransition } from "./state.js"
import { isStateTransition, NESTED } from "./state.js"

type AnyStateTransition = StateTransition<
  string,
  Action<string, unknown>,
  unknown
>

const asStateTransition = (value: unknown): AnyStateTransition | undefined =>
  isStateTransition(value) ? (value as AnyStateTransition) : undefined

/**
 * Options for {@link getStatePath}.
 */
export interface StatePathOptions {
  /**
   * String inserted between each level of the composed path. Defaults to `"/"`.
   */
  separator?: string
}

/**
 * A minimal structural view of anything that can report a current state: a
 * {@link import("./runtime.js").Runtime}, a nested runtime handle, or any object
 * exposing a `currentState()` accessor. Typed structurally so this module never
 * has to value-import the runtime (which would create an import cycle with
 * `nested.ts`).
 */
interface CurrentStateHolder {
  currentState: () => unknown
}

const hasCurrentState = (value: unknown): value is CurrentStateHolder =>
  typeof value === "object" &&
  value !== null &&
  "currentState" in value &&
  typeof (value as { currentState?: unknown }).currentState === "function"

const getNestedHolder = (data: unknown): CurrentStateHolder | undefined => {
  if (typeof data !== "object" || data === null) {
    return undefined
  }

  const nested = (data as { [NESTED]?: unknown })[NESTED]

  return hasCurrentState(nested) ? nested : undefined
}

/**
 * Build a composed, hierarchical path string for a state and any nested child
 * regions it owns, mirroring XState's `state.toStrings()` for logging and
 * analytics.
 *
 * Accepts either a state transition (e.g. `runtime.currentState()`) or anything
 * exposing a `currentState()` accessor (such as a {@link import("./runtime.js").Runtime}).
 * It walks the nested child runtime stored under the `NESTED` symbol on each
 * level's `data`, joining the state names with the configured separator.
 *
 * @example
 * ```ts
 * getStatePath(runtime.currentState()) // "Connected/Live"
 * getStatePath(runtime, { separator: "." }) // "Connected.Live"
 * getStatePath(Idle()) // "Idle" (flat state, no separator)
 * ```
 */
export const getStatePath = (
  stateOrRuntime: unknown,
  options?: StatePathOptions,
): string => {
  const separator = options?.separator ?? "/"

  let transition: AnyStateTransition | undefined
  if (isStateTransition(stateOrRuntime)) {
    transition = asStateTransition(stateOrRuntime)
  } else if (hasCurrentState(stateOrRuntime)) {
    transition = asStateTransition(stateOrRuntime.currentState())
  }

  if (!transition) {
    return ""
  }

  const names: string[] = []
  let current: AnyStateTransition | undefined = transition

  while (current) {
    names.push(current.name)

    const childHolder = getNestedHolder(current.data)
    const childState = childHolder?.currentState()

    current = asStateTransition(childState)
  }

  return names.join(separator)
}
