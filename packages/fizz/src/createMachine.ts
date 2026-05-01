import type { StateSelector } from "./selectors.js"

type MachineStates = Record<
  string,
  {
    (...data: Array<any>): any
    name: string
  }
>

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
  Clients extends Record<string, unknown> = Record<string, unknown>,
> = {
  actions?: Actions
  clients?: Clients
  initialState?: InitialState
  name?: string
  outputActions?: OutputActions
  outputs?: OutputActions
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
  Clients extends Record<string, unknown> = Record<string, unknown>,
> = MachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors,
  Clients
> & {
  [createdMachineSymbol]: true
  withInitialState: <NextInitialState>(
    initialState: NextInitialState,
  ) => CreatedMachineDefinition<
    States,
    Actions,
    OutputActions,
    NextInitialState,
    Selectors,
    Clients
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
  Clients extends Record<string, unknown>,
>(
  machine: MachineDefinition<
    States,
    Actions,
    OutputActions,
    InitialState,
    Selectors,
    Clients
  >,
): CreatedMachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors,
  Clients
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
      Selectors,
      Clients
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
    Selectors,
    Clients
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
  Clients extends Record<string, unknown> = Record<string, unknown>,
>(
  definition: MachineDefinition<
    States,
    Actions,
    OutputActions,
    InitialState,
    Selectors,
    Clients
  >,
  name?: string,
): CreatedMachineDefinition<
  States,
  Actions,
  OutputActions,
  InitialState,
  Selectors,
  Clients
> => {
  if (
    definition.outputActions !== undefined &&
    definition.outputs !== undefined
  ) {
    throw new Error(
      "createMachine(...) accepts either outputs or outputActions, not both",
    )
  }

  const machineName = name ?? definition.name
  const normalizedDefinition =
    definition.outputs === undefined
      ? definition
      : {
          ...definition,
          outputActions: definition.outputs,
        }

  const machine =
    machineName === undefined
      ? normalizedDefinition
      : {
          ...normalizedDefinition,
          name: machineName,
        }

  return createMachineWithMethods(machine)
}
