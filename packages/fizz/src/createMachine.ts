export type MachineDefinition<
  States,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
> = {
  actions?: Actions
  name?: string
  outputActions?: OutputActions
  states: States
}

export const createMachine = <
  States,
  Actions = Record<string, never>,
  OutputActions = Record<string, never>,
>(
  definition: MachineDefinition<States, Actions, OutputActions>,
  name?: string,
): MachineDefinition<States, Actions, OutputActions> => {
  const machineName = name ?? definition.name

  if (machineName === undefined) {
    return definition
  }

  return {
    ...definition,
    name: machineName,
  }
}
