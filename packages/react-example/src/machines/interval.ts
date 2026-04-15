import {
  type ActionCreatorType,
  action,
  createMachine,
  type Enter,
  state,
} from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

const pause = action("Pause")
type Pause = ActionCreatorType<typeof pause>

const resume = action("Resume")
type Resume = ActionCreatorType<typeof resume>

const faster = action("Faster")
type Faster = ActionCreatorType<typeof faster>

const reset = action("Reset")
type Reset = ActionCreatorType<typeof reset>

type IntervalId = "ticker"

type IntervalDemoData = {
  intervalMs: number
  recentEvents: string[]
  status: "paused" | "running"
  tickCount: number
}

const defaultIntervalMs = 1000

const appendEvent = (
  data: IntervalDemoData,
  event: string,
): IntervalDemoData => ({
  ...data,
  recentEvents: [...data.recentEvents, event].slice(-6),
})

const initialData = (): IntervalDemoData => ({
  intervalMs: defaultIntervalMs,
  recentEvents: ["ready"],
  status: "running",
  tickCount: 0,
})

type Actions = Enter | Pause | Resume | Faster | Reset

const IntervalDemo = state<Actions, IntervalDemoData, IntervalId>(
  {
    Enter: (data, _, { startInterval, update }) => [
      update(appendEvent(data, `enter:${data.intervalMs}`)),
      startInterval("ticker", data.intervalMs),
    ],

    Pause: (data, _, { cancelInterval, update }) => [
      update(
        appendEvent(
          {
            ...data,
            status: "paused",
          },
          "pause",
        ),
      ),
      cancelInterval("ticker"),
    ],

    Resume: (data, _, { startInterval, update }) => [
      update(
        appendEvent(
          {
            ...data,
            status: "running",
          },
          `resume:${data.intervalMs}`,
        ),
      ),
      startInterval("ticker", data.intervalMs),
    ],

    Faster: (data, _, { restartInterval, update }) => {
      const nextIntervalMs = Math.max(250, data.intervalMs - 250)

      return [
        update(
          appendEvent(
            {
              ...data,
              intervalMs: nextIntervalMs,
              status: "running",
            },
            `restart:${nextIntervalMs}`,
          ),
        ),
        restartInterval("ticker", nextIntervalMs),
      ]
    },

    Reset: (_, __, { restartInterval, update }) => {
      const nextData = appendEvent(
        initialData(),
        `restart:${defaultIntervalMs}`,
      )

      return [update(nextData), restartInterval("ticker", defaultIntervalMs)]
    },

    IntervalStarted: (data, { delay }, { update }) => {
      return update(appendEvent(data, `interval-started:${delay}`))
    },

    IntervalTriggered: (data, _, { update }) => {
      return update(
        appendEvent(
          {
            ...data,
            tickCount: data.tickCount + 1,
          },
          `tick:${data.tickCount + 1}`,
        ),
      )
    },

    IntervalCancelled: (data, { delay }, { update }) => {
      return update(appendEvent(data, `interval-cancelled:${delay}`))
    },
  },
  { name: "IntervalDemo" },
)

const MachineActions = {
  faster,
  pause,
  reset,
  resume,
}

export const IntervalMachine = createMachine(
  {
    actions: MachineActions,
    states: {
      IntervalDemo,
    },
  },
  "IntervalMachine",
)

export default IntervalMachine

export const useIntervalMachine = () => {
  return useMachine(
    IntervalMachine,
    IntervalMachine.states.IntervalDemo(initialData()),
  )
}
