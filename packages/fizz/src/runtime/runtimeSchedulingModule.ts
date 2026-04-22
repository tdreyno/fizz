import type { Action } from "../action.js"
import {
  intervalCancelled,
  intervalStarted,
  intervalTriggered,
  onFrame,
  timerCancelled,
  timerCompleted,
  timerStarted,
} from "../action.js"
import type {
  CancelIntervalEffectData,
  CancelTimerEffectData,
  RestartIntervalEffectData,
  RestartTimerEffectData,
  StartIntervalEffectData,
  StartTimerEffectData,
} from "../effect.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeDebugCancellationReason,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeState,
} from "./runtimeContracts.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"
import type { ActiveFrame, ActiveTimer } from "./timerScheduler.js"
import {
  cancelActiveFrameOperation,
  cancelActiveIntervalOperation,
  cancelActiveTimerOperation,
  canHandleFrameElapsed,
  canHandleIntervalElapsed,
  canHandleTimerElapsed,
  clearScheduledOperations,
  replaceIntervalOperation,
  replaceTimerOperation,
  startFrameOperation,
  startIntervalOperation,
  startTimerOperation,
} from "./timerScheduler.js"

export type RuntimeSchedulingModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

export const createRuntimeSchedulingModule = (options: {
  actionCommand: (command: Action<string, unknown>) => RuntimeDebugCommand
  emitMonitor: (event: RuntimeDebugEvent) => void
  runAction: (action: Action<string, unknown>) => Promise<void>
  timerDriver: RuntimeTimerDriver
}): RuntimeSchedulingModule => {
  const intervals = new Map<string, ActiveTimer>()
  let frame: ActiveFrame | undefined
  let timerCounter = 1
  const timers = new Map<string, ActiveTimer>()

  const clearOperations = () => {
    clearScheduledOperations({
      frame,
      intervals,
      timerDriver: options.timerDriver,
      timers,
    })

    frame = undefined
  }

  const emitCleanupEvents = () => {
    timers.forEach((timer, timeoutId) => {
      options.emitMonitor({
        delay: timer.delay,
        reason: "cleanup",
        timeoutId,
        type: "timer-cancelled",
      })
    })

    intervals.forEach((interval, intervalId) => {
      options.emitMonitor({
        delay: interval.delay,
        intervalId,
        reason: "cleanup",
        type: "interval-cancelled",
      })
    })

    if (frame) {
      options.emitMonitor({
        reason: "cleanup",
        type: "frame-cancelled",
      })
    }
  }

  const cancelActiveFrame = (reason: RuntimeDebugCancellationReason) => {
    if (frame) {
      options.emitMonitor({
        reason,
        type: "frame-cancelled",
      })
    }

    cancelActiveFrameOperation({
      frame,
      timerDriver: options.timerDriver,
    })

    frame = undefined
  }

  const handleStartTimer = <TimeoutId extends string>(
    data: StartTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] => {
    const replacedTimer = timers.get(data.timeoutId)

    if (replacedTimer) {
      options.emitMonitor({
        delay: replacedTimer.delay,
        reason: "restart",
        timeoutId: data.timeoutId,
        type: "timer-cancelled",
      })
    }

    replaceTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: options.timerDriver,
      timers,
    })

    startTimerOperation({
      delay: data.delay,
      nextToken: () => timerCounter++,
      onElapsed: async token => {
        const activeTimer = timers.get(data.timeoutId)

        if (!activeTimer || !canHandleTimerElapsed(activeTimer, token)) {
          return
        }

        timers.delete(data.timeoutId)
        options.emitMonitor({
          delay: data.delay,
          timeoutId: data.timeoutId,
          type: "timer-completed",
        })
        await options.runAction(timerCompleted(data))
      },
      timeoutId: data.timeoutId,
      timerDriver: options.timerDriver,
      timers,
    })

    options.emitMonitor({
      delay: data.delay,
      timeoutId: data.timeoutId,
      type: "timer-started",
    })

    return [options.actionCommand(timerStarted(data))]
  }

  const handleCancelTimer = <TimeoutId extends string>(
    data: CancelTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] => {
    const cancelled = cancelActiveTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: options.timerDriver,
      timers,
    })

    if (!cancelled) {
      return []
    }

    options.emitMonitor({
      delay: cancelled.delay,
      reason: "effect",
      timeoutId: data.timeoutId,
      type: "timer-cancelled",
    })

    return [
      options.actionCommand(
        timerCancelled({ timeoutId: data.timeoutId, delay: cancelled.delay }),
      ),
    ]
  }

  const handleRestartTimer = <TimeoutId extends string>(
    data: RestartTimerEffectData<TimeoutId>,
  ): RuntimeDebugCommand[] => {
    const cancelled = cancelActiveTimerOperation({
      timeoutId: data.timeoutId,
      timerDriver: options.timerDriver,
      timers,
    })

    return [
      ...(cancelled
        ? [
            options.actionCommand(
              timerCancelled({
                timeoutId: data.timeoutId,
                delay: cancelled.delay,
              }),
            ),
          ]
        : []),
      ...handleStartTimer(data),
    ]
  }

  const handleStartInterval = <IntervalId extends string>(
    data: StartIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] => {
    const replacedInterval = intervals.get(data.intervalId)

    if (replacedInterval) {
      options.emitMonitor({
        delay: replacedInterval.delay,
        intervalId: data.intervalId,
        reason: "restart",
        type: "interval-cancelled",
      })
    }

    replaceIntervalOperation({
      intervalId: data.intervalId,
      intervals,
      timerDriver: options.timerDriver,
    })

    startIntervalOperation({
      delay: data.delay,
      intervalId: data.intervalId,
      intervals,
      nextToken: () => timerCounter++,
      onElapsed: async token => {
        const activeInterval = intervals.get(data.intervalId)

        if (
          !activeInterval ||
          !canHandleIntervalElapsed(activeInterval, token)
        ) {
          return
        }

        options.emitMonitor({
          delay: data.delay,
          intervalId: data.intervalId,
          type: "interval-triggered",
        })
        await options.runAction(intervalTriggered(data))
      },
      timerDriver: options.timerDriver,
    })

    options.emitMonitor({
      delay: data.delay,
      intervalId: data.intervalId,
      type: "interval-started",
    })

    return [options.actionCommand(intervalStarted(data))]
  }

  const handleCancelInterval = <IntervalId extends string>(
    data: CancelIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] => {
    const cancelled = cancelActiveIntervalOperation({
      intervalId: data.intervalId,
      intervals,
      timerDriver: options.timerDriver,
    })

    if (!cancelled) {
      return []
    }

    options.emitMonitor({
      delay: cancelled.delay,
      intervalId: data.intervalId,
      reason: "effect",
      type: "interval-cancelled",
    })

    return [
      options.actionCommand(
        intervalCancelled({
          intervalId: data.intervalId,
          delay: cancelled.delay,
        }),
      ),
    ]
  }

  const handleRestartInterval = <IntervalId extends string>(
    data: RestartIntervalEffectData<IntervalId>,
  ): RuntimeDebugCommand[] => {
    const cancelled = cancelActiveIntervalOperation({
      intervalId: data.intervalId,
      intervals,
      timerDriver: options.timerDriver,
    })

    return [
      ...(cancelled
        ? [
            options.actionCommand(
              intervalCancelled({
                intervalId: data.intervalId,
                delay: cancelled.delay,
              }),
            ),
          ]
        : []),
      ...handleStartInterval(data),
    ]
  }

  const handleStartFrame = (): RuntimeDebugCommand[] => {
    cancelActiveFrame("restart")

    frame = startFrameOperation({
      nextToken: () => timerCounter++,
      onFrame: async (timestamp, token) => {
        if (!frame || !canHandleFrameElapsed(frame, token)) {
          return
        }

        options.emitMonitor({
          timestamp,
          type: "frame-triggered",
        })
        await options.runAction(onFrame(timestamp))
      },
      timerDriver: options.timerDriver,
    })

    options.emitMonitor({
      type: "frame-started",
    })

    return []
  }

  return {
    clear: () => {
      emitCleanupEvents()
      clearOperations()
    },
    clearForGoBack: () => {
      emitCleanupEvents()
      clearOperations()
    },
    clearForTransition: ({ currentState, targetState }) => {
      if (!currentState || currentState.name === targetState.name) {
        return
      }

      emitCleanupEvents()
      clearOperations()
    },
    effectHandlers: new Map([
      [
        "startTimer",
        item => handleStartTimer(item.data as StartTimerEffectData<string>),
      ],
      [
        "cancelTimer",
        item => handleCancelTimer(item.data as CancelTimerEffectData<string>),
      ],
      [
        "restartTimer",
        item => handleRestartTimer(item.data as RestartTimerEffectData<string>),
      ],
      [
        "startInterval",
        item =>
          handleStartInterval(item.data as StartIntervalEffectData<string>),
      ],
      [
        "cancelInterval",
        item =>
          handleCancelInterval(item.data as CancelIntervalEffectData<string>),
      ],
      [
        "restartInterval",
        item =>
          handleRestartInterval(item.data as RestartIntervalEffectData<string>),
      ],
      ["startFrame", () => handleStartFrame()],
      [
        "cancelFrame",
        () => {
          cancelActiveFrame("effect")

          return []
        },
      ],
    ]),
  }
}
