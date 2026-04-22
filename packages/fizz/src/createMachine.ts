export type MachineDefinition<
  States,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
> = {
  actions?: Actions
  initialState?: InitialState
  name?: string
  outputActions?: OutputActions
  states: States
}

export const createdMachineSymbol = Symbol("CREATED_MACHINE")

export type CreatedMachineDefinition<
  States,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
> = MachineDefinition<States, Actions, OutputActions, InitialState> & {
  [createdMachineSymbol]: true
  withInitialState: <NextInitialState>(
    initialState: NextInitialState,
  ) => CreatedMachineDefinition<
    States,
    Actions,
    OutputActions,
    NextInitialState
  > & {
    initialState: NextInitialState
  }
}

const createMachineWithMethods = <States, Actions, OutputActions, InitialState>(
  machine: MachineDefinition<States, Actions, OutputActions, InitialState>,
): CreatedMachineDefinition<States, Actions, OutputActions, InitialState> => {
  const withInitialState = <NextInitialState>(initialState: NextInitialState) =>
    createMachine({
      ...machine,
      initialState,
    }) as CreatedMachineDefinition<
      States,
      Actions,
      OutputActions,
      NextInitialState
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
  ) as CreatedMachineDefinition<States, Actions, OutputActions, InitialState>

  return Object.defineProperty(machineWithBrand, "withInitialState", {
    enumerable: false,
    value: withInitialState,
  })
}

export const createMachine = <
  States,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
  InitialState = unknown,
>(
  definition: MachineDefinition<States, Actions, OutputActions, InitialState>,
  name?: string,
): CreatedMachineDefinition<States, Actions, OutputActions, InitialState> => {
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
