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
import { PARENT_RUNTIME, state } from "./state.js"

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
) => HandlerReturn

type NestedForwarders<
  Actions extends Action<string, unknown>,
  Data,
  NAM extends NestedActionMap,
> = {
  [K in keyof NAM]?: NestedForwarder<Actions, Data, ActionCreatorType<NAM[K]>>
}

export const NESTED = Symbol("Nested runtime")

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
    ) => HandlerReturn
  },
  initialNestedState: StateTransition<string, Action<string, unknown>, unknown>,
  nestedActions: NAM,
  options?: { name?: string },
) => {
  const beforeEnter = async (
    data: Data,
    parentRuntime: ActionPayload<BeforeEnter>,
    { update }: NestedUpdateUtils<Actions, Data>,
  ): Promise<HandlerReturn> => {
    if (!parentRuntime) {
      return noop()
    }

    if (
      typeof initialNestedState.data === "object" &&
      initialNestedState.data !== null
    ) {
      ;(
        initialNestedState.data as {
          [PARENT_RUNTIME]?: ActionPayload<BeforeEnter>
        }
      )[PARENT_RUNTIME] = parentRuntime
    }

    const runtime = new Runtime(
      createInitialContext([initialNestedState]),
      nestedActions,
    )

    await runtime.run(enter())

    return update({
      ...data,
      [NESTED]: runtime,
    })
  }

  const forwarders = Object.entries(nestedActions).reduce(
    (acc, [key, action]) => {
      const typedKey = key as keyof NAM
      const typedAction = action as NAM[typeof typedKey]

      acc[typedKey] = (async (data, payload, { update }) => {
        const nestedRuntime =
          typeof data === "object" && data !== null && NESTED in data
            ? (data as NestedRuntimeData<Actions>)[NESTED]
            : undefined

        if (nestedRuntime) {
          await nestedRuntime.run(
            typedAction(payload) as ActionCreatorType<
              NAM[typeof typedKey]
            > as Actions,
          )
        }

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
