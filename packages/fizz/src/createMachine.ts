import type { StateSelector } from "./selectors.js"
import type { BoundStateFn } from "./state.js"

type MachineStates = Record<string, BoundStateFn<any, any, any>>

type MachineSelectors<States extends MachineStates> = Record<
  string,
  StateSelector<
    States[keyof States] | ReadonlyArray<States[keyof States]>,
    unknown
  >
>

export type MachineDefinition<
  States extends MachineStates,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
  Selectors extends MachineSelectors<States> = Record<string, never>,
> = {
  actions?: Actions
  initialState?: InitialState
  name?: string
  outputActions?: OutputActions
  selectors?: Selectors
  states: States
}

export const createdMachineSymbol = Symbol("CREATED_MACHINE")

export type CreatedMachineDefinition<
  States extends MachineStates,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
  Selectors extends MachineSelectors<States> = Record<string, never>,
> = MachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors
> & {
  [createdMachineSymbol]: true
  withInitialState: <NextInitialState>(
    initialState: NextInitialState,
  ) => CreatedMachineDefinition<
    States,
    Actions,
    OutputActions,
    NextInitialState,
    Selectors
  > & {
    initialState: NextInitialState
  }
}

const createMachineWithMethods = <
  States extends MachineStates,
  Actions,
  OutputActions,
  InitialState,
  Selectors extends MachineSelectors<States>,
>(
  machine: MachineDefinition<
    States,
    Actions,
    OutputActions,
    InitialState,
    Selectors
  >,
): CreatedMachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors
> => {
  const withInitialState = <NextInitialState>(initialState: NextInitialState) =>
    createMachine({
      ...machine,
      initialState,
    }) as CreatedMachineDefinition<
      States,
      Actions,
      OutputActions,
      NextInitialState,
      Selectors
    > & {
      initialState: NextInitialState
    }

  const machineWithBrand = Object.defineProperty(
    machine,
    createdMachineSymbol,
    {
      enumerable: false,
      value: true,
    },
  ) as CreatedMachineDefinition<
    States,
    Actions,
    OutputActions,
    InitialState,
    Selectors
  >

  return Object.defineProperty(machineWithBrand, "withInitialState", {
    enumerable: false,
    value: withInitialState,
  })
}

export const createMachine = <
  States extends MachineStates,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
  Selectors extends MachineSelectors<States> = Record<string, never>,
>(
  definition: MachineDefinition<
    States,
    Actions,
    OutputActions,
    InitialState,
    Selectors
  >,
  name?: string,
): CreatedMachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors
> => {
  const machineName = name ?? definition.name

  const machine =
    machineName === undefined
      ? definition
      : {
          ...definition,
          name: machineName,
        }

  return createMachineWithMethods(machine)
}
