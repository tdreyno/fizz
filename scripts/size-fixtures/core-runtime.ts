import { action, createMachine, createRuntime, state } from "@tdreyno/fizz"

const boot = action("BOOT")

const machine = createMachine({
  actions: {
    boot,
  },
  states: {
    idle: state({
      on: {
        [boot.type]: data => data,
      },
    }),
  },
})

export const scenario = {
  createMachine,
  createRuntime,
  machine,
  state,
}
