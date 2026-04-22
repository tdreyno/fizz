import type { Action } from "./action.js"
import { enter } from "./action.js"
import type { CreatedMachineDefinition } from "./createMachine.js"
import { createMachine } from "./createMachine.js"
import { noop } from "./effect.js"
import type { Runtime } from "./runtime.js"
import { createRuntime } from "./runtime.js"
import type { StateTransition } from "./state.js"
import { state } from "./state.js"

type RuntimeActionMap = {
  [key: string]: (...args: Array<unknown>) => Action<string, unknown>
}

type RuntimeStateMap = {
  [key: string]: (
    ...args: Array<unknown>
  ) => StateTransition<string, Action<string, unknown>, unknown>
}

type RuntimeInitialState = ReturnType<RuntimeStateMap[keyof RuntimeStateMap]>

export type ParallelMachine = CreatedMachineDefinition<
  RuntimeStateMap,
  RuntimeActionMap,
  RuntimeActionMap,
  RuntimeInitialState
> & {
  initialState: RuntimeInitialState
}

export type ParallelBranchMap = Record<string, ParallelMachine>

export type ParallelActions = {
  [key: string]: (...args: Array<unknown>) => Action<string, unknown>
}

export type ParallelRuntimeMap = Record<
  string,
  Runtime<RuntimeActionMap, RuntimeActionMap>
>

export const PARALLEL_RUNTIMES = Symbol("PARALLEL_RUNTIMES")

type ParallelStateData = {
  [PARALLEL_RUNTIMES]?: ParallelRuntimeMap
}

export const getParallelRuntimes = (data: unknown): ParallelRuntimeMap => {
  const typedData = data as ParallelStateData

  return typedData[PARALLEL_RUNTIMES] ?? {}
}

const validateParallelMachines = (branches: ParallelBranchMap): void => {
  Object.entries(branches).forEach(([key, machine]) => {
    if (machine.initialState === undefined) {
      throw new Error(
        `Parallel machine branch "${key}" is missing initialState. Define it on the createMachine(...) result before passing it to createParallelMachine(...).`,
      )
    }
  })
}

const getActionType = (
  actionCreator: (...args: Array<unknown>) => Action<string, unknown>,
): string => {
  const maybeTypedActionCreator = actionCreator as {
    type?: string
  }

  return maybeTypedActionCreator.type ?? ""
}

const mergeParallelActions = (branches: ParallelBranchMap): ParallelActions =>
  Object.values(branches).reduce((actions, branch) => {
    const branchActions = branch.actions ?? {}

    return Object.entries(branchActions).reduce(
      (nextActions, [key, action]) => {
        const typedAction = action as (
          ...args: Array<unknown>
        ) => Action<string, unknown>
        const existingAction = nextActions[key]

        if (!existingAction) {
          return {
            ...nextActions,
            [key]: typedAction,
          }
        }

        const existingType = getActionType(existingAction)
        const incomingType = getActionType(typedAction)

        if (existingType !== incomingType) {
          throw new Error(
            `Parallel action conflict for key: ${key}. Expected action type ${existingType} but received ${incomingType}`,
          )
        }

        return nextActions
      },
      actions,
    )
  }, {} as ParallelActions)

const createParallelRuntimes = async (
  branches: ParallelBranchMap,
): Promise<ParallelRuntimeMap> => {
  const entries = await Promise.all(
    Object.entries(branches).map(async ([key, machine]) => {
      const runtime = createRuntime(machine, machine.initialState)

      await runtime.run(enter())

      return [key, runtime] as const
    }),
  )

  return entries.reduce(
    (runtimes, [key, runtime]) => ({
      ...runtimes,
      [key]: runtime,
    }),
    {} as ParallelRuntimeMap,
  )
}

const runParallelAction = async (
  runtimes: ParallelRuntimeMap,
  createAction: (...args: Array<unknown>) => Action<string, unknown>,
  payload: unknown,
): Promise<void> => {
  const runCalls = Object.values(runtimes).flatMap(runtime => {
    const action = createAction(payload)

    return runtime.canHandle(action) ? [runtime.run(action)] : []
  })

  await Promise.all(runCalls)
}

export const createParallelMachine = (
  branches: ParallelBranchMap,
  options: { name?: string } = {},
) => {
  validateParallelMachines(branches)

  const actions = mergeParallelActions(branches)

  const dynamicHandlers = Object.entries(actions).reduce(
    (handlers, [, createAction]) => {
      const actionType = getActionType(createAction)

      return {
        ...handlers,
        [actionType]: async (
          data: ParallelStateData,
          payload: unknown,
          {
            update,
          }: {
            update: (
              nextData: ParallelStateData,
            ) => StateTransition<
              string,
              Action<string, unknown>,
              ParallelStateData
            >
          },
        ) => {
          const runtimes = data[PARALLEL_RUNTIMES]

          if (!runtimes) {
            return noop()
          }

          await runParallelAction(runtimes, createAction, payload)

          return update({
            ...data,
          })
        },
      }
    },
    {} as Record<
      string,
      (
        data: ParallelStateData,
        payload: unknown,
        utils: {
          update: (
            nextData: ParallelStateData,
          ) => StateTransition<
            string,
            Action<string, unknown>,
            ParallelStateData
          >
        },
      ) =>
        | Promise<
            | StateTransition<
                string,
                Action<string, unknown>,
                ParallelStateData
              >
            | ReturnType<typeof noop>
          >
        | ReturnType<typeof noop>
    >,
  )

  const Running = state<Action<string, unknown>, ParallelStateData>(
    {
      Enter: async (data, _, { update }) => {
        const runtimes = await createParallelRuntimes(branches)

        return update({
          ...data,
          [PARALLEL_RUNTIMES]: runtimes,
        })
      },
      ...dynamicHandlers,
    },
    {
      name: "ParallelRunning",
    },
  )

  const machine = createMachine(
    {
      actions,
      states: {
        Running,
      },
    },
    options.name,
  )

  return {
    actions,
    initialState: Running({}),
    machine,
    states: machine.states,
  }
}
