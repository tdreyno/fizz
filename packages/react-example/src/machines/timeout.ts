import {
  type ActionCreatorType,
  action,
  createMachine,
  type Enter,
  state,
} from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

const arm = action("Arm")
type Arm = ActionCreatorType<typeof arm>

const cancel = action("Cancel")
type Cancel = ActionCreatorType<typeof cancel>

const faster = action("Faster")
type Faster = ActionCreatorType<typeof faster>

const reset = action("Reset")
type Reset = ActionCreatorType<typeof reset>

type TimeoutId = "toast"

type TimeoutDemoData = {
  delayMs: number
  fireCount: number
  recentEvents: string[]
  status: "armed" | "cancelled" | "elapsed" | "idle"
}

const defaultDelayMs = 1800

const appendEvent = (
  data: TimeoutDemoData,
  event: string,
): TimeoutDemoData => ({
  ...data,
  recentEvents: [...data.recentEvents, event].slice(-6),
})

const initialData = (): TimeoutDemoData => ({
  delayMs: defaultDelayMs,
  fireCount: 0,
  recentEvents: ["ready"],
  status: "idle",
})

type Actions = Enter | Arm | Cancel | Faster | Reset

const TimeoutDemo = state<Actions, TimeoutDemoData, TimeoutId>(
  {
    Enter: (data, _, { startTimer, update }) => [
      update(
        appendEvent(
          {
            ...data,
            status: "armed",
          },
          `enter:${data.delayMs}`,
        ),
      ),
      startTimer("toast", data.delayMs),
    ],

    Arm: (data, _, { startTimer, update }) => [
      update(
        appendEvent(
          {
            ...data,
            status: "armed",
          },
          `arm:${data.delayMs}`,
        ),
      ),
      startTimer("toast", data.delayMs),
    ],

    Cancel: (data, _, { cancelTimer, update }) => [
      update(
        appendEvent(
          {
            ...data,
            status: "cancelled",
          },
          "cancel",
        ),
      ),
      cancelTimer("toast"),
    ],

    Faster: (data, _, { restartTimer, update }) => {
      const nextDelayMs = Math.max(300, data.delayMs - 300)

      return [
        update(
          appendEvent(
            {
              ...data,
              delayMs: nextDelayMs,
              status: "armed",
            },
            `restart:${nextDelayMs}`,
          ),
        ),
        restartTimer("toast", nextDelayMs),
      ]
    },

    Reset: (_, __, { restartTimer, update }) => {
      const nextData = appendEvent(
        {
          ...initialData(),
          status: "armed",
        },
        `restart:${defaultDelayMs}`,
      )

      return [update(nextData), restartTimer("toast", defaultDelayMs)]
    },

    TimerStarted: (data, { delay }, { update }) => {
      return update(appendEvent(data, `timer-started:${delay}`))
    },

    TimerCompleted: (data, { delay }, { update }) => {
      return update(
        appendEvent(
          {
            ...data,
            fireCount: data.fireCount + 1,
            status: "elapsed",
          },
          `timer-completed:${delay}`,
        ),
      )
    },

    TimerCancelled: (data, { delay }, { update }) => {
      return update(appendEvent(data, `timer-cancelled:${delay}`))
    },
  },
  { name: "TimeoutDemo" },
)

const MachineActions = {
  arm,
  cancel,
  faster,
  reset,
}

export const TimeoutMachine = createMachine({
  actions: MachineActions,
  name: "TimeoutMachine",
  states: {
    TimeoutDemo,
  },
})

export default TimeoutMachine

export const useTimeoutMachine = () => {
  return useMachine(
    TimeoutMachine,
    TimeoutMachine.states.TimeoutDemo(initialData()),
  )
}
