import type {
  Action,
  ActionCreator,
  ActionCreatorType,
  ActionName,
  ActionPayload,
  BeforeEnter,
} from "./action.js"
import { enter } from "./action.js"
import { createInitialContext } from "./context.js"
import { noop } from "./effect.js"
import { Runtime } from "./runtime.js"
import type { HandlerReturn, StateTransition } from "./state.js"
import { NESTED, PARENT_RUNTIME, state } from "./state.js"

type NestedActionMap = {
  [key: string]: ActionCreator<string, unknown>
}

type NestedRuntimeHandle<Actions extends Action<string, unknown>> = {
  run: (action: Actions) => Promise<void>
}

type NestedRuntimeData<Actions extends Action<string, unknown>> = {
  [NESTED]?: NestedRuntimeHandle<Actions>
}

type NestedUpdateUtils<Actions extends Action<string, unknown>, Data> = {
  update: (data: Data) => StateTransition<string, Actions, Data>
}

type NestedForwarder<
  Actions extends Action<string, unknown>,
  Data,
  A extends Action<string, unknown>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: NestedUpdateUtils<Actions, Data>,
) => HandlerReturn<Data>

type NestedForwarders<
  Actions extends Action<string, unknown>,
  Data,
  NAM extends NestedActionMap,
> = {
  [K in keyof NAM]?: NestedForwarder<Actions, Data, ActionCreatorType<NAM[K]>>
}

type NestedForwardHookInfo<NAM extends NestedActionMap, Data> = {
  action: keyof NAM & string
  payload: ActionPayload<ActionCreatorType<NAM[keyof NAM]>>
  data: Data
}

type NestedPayloadMappers<NAM extends NestedActionMap, Data> = {
  [K in keyof NAM]?: (
    payload: ActionPayload<ActionCreatorType<NAM[K]>>,
    data: Data,
  ) => ActionPayload<ActionCreatorType<NAM[K]>>
}

type StateWithNestedOptions<NAM extends NestedActionMap, Data> = {
  name?: string
  forward?: "all" | "none" | Array<keyof NAM>
  mapPayload?: NestedPayloadMappers<NAM, Data>
  beforeForward?: (info: NestedForwardHookInfo<NAM, Data>) => void
  afterForward?: (info: NestedForwardHookInfo<NAM, Data>) => void
}

export { NESTED } from "./state.js"
export type { StatePathOptions } from "./statePath.js"
export { getStatePath } from "./statePath.js"

export const stateWithNested = <
  Actions extends Action<string, unknown>,
  NAM extends NestedActionMap,
  Data = undefined,
>(
  handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => HandlerReturn<Data>
  },
  initialNestedState:
    | StateTransition<string, Action<string, unknown>, unknown>
    | ((
        data: Data,
      ) => StateTransition<string, Action<string, unknown>, unknown>),
  nestedActions: NAM,
  options?: StateWithNestedOptions<NAM, Data>,
) => {
  const beforeEnter = async (
    data: Data,
    parentRuntime: ActionPayload<BeforeEnter>,
    { update }: NestedUpdateUtils<Actions, Data>,
  ): Promise<HandlerReturn> => {
    if (!parentRuntime) {
      return noop()
    }

    const resolvedNestedState =
      typeof initialNestedState === "function"
        ? initialNestedState(data)
        : initialNestedState

    if (
      typeof resolvedNestedState.data === "object" &&
      resolvedNestedState.data !== null
    ) {
      ;(
        resolvedNestedState.data as {
          [PARENT_RUNTIME]?: ActionPayload<BeforeEnter>
        }
      )[PARENT_RUNTIME] = parentRuntime
    }

    const runtime = new Runtime(
      createInitialContext([resolvedNestedState]),
      nestedActions,
    )

    ;(runtime as { [PARENT_RUNTIME]?: ActionPayload<BeforeEnter> })[
      PARENT_RUNTIME
    ] = parentRuntime

    await runtime.run(enter())

    return update({
      ...data,
      [NESTED]: runtime,
    })
  }

  const forward = options?.forward ?? "all"
  const shouldForward = (key: keyof NAM): boolean => {
    if (forward === "none") {
      return false
    }

    if (forward === "all") {
      return true
    }

    return forward.includes(key)
  }

  const forwarders = Object.entries(nestedActions).reduce(
    (acc, [key, action]) => {
      const typedKey = key as keyof NAM

      if (!shouldForward(typedKey)) {
        return acc
      }

      const typedAction = action as NAM[typeof typedKey]
      const mapPayload = options?.mapPayload?.[typedKey]

      acc[typedKey] = (async (data, payload, { update }) => {
        const nestedRuntime =
          typeof data === "object" && data !== null && NESTED in data
            ? (data as NestedRuntimeData<Actions>)[NESTED]
            : undefined

        const forwardedPayload = mapPayload
          ? mapPayload(
              payload as ActionPayload<ActionCreatorType<NAM[typeof typedKey]>>,
              data,
            )
          : (payload as ActionPayload<ActionCreatorType<NAM[typeof typedKey]>>)

        const hookInfo: NestedForwardHookInfo<NAM, Data> = {
          action: typedKey as keyof NAM & string,
          payload: forwardedPayload as ActionPayload<
            ActionCreatorType<NAM[keyof NAM]>
          >,
          data,
        }

        options?.beforeForward?.(hookInfo)

        if (nestedRuntime) {
          await nestedRuntime.run(
            typedAction(forwardedPayload) as ActionCreatorType<
              NAM[typeof typedKey]
            > as Actions,
          )
        }

        options?.afterForward?.(hookInfo)

        return update({ ...data })
      }) as NestedForwarders<Actions, Data, NAM>[typeof typedKey]

      return acc
    },
    {} as NestedForwarders<Actions, Data, NAM>,
  )

  return state<Actions, Data>(
    { ...handlers, ...forwarders, BeforeEnter: beforeEnter },
    options,
  )
}
