import type { IntervalPayload, TimerPayload } from "../action.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"

export type ActiveTimer = {
  delay: number
  handle: unknown
  token: number
}

export type ActiveFrame = {
  handle: unknown
  token: number
}

type StartTimerOperationOptions<TimeoutId extends string> = {
  delay: number
  nextToken: () => number
  onElapsed: (token: number) => Promise<void>
  timeoutId: TimeoutId
  timerDriver: RuntimeTimerDriver
  timers: Map<string, ActiveTimer>
}

type CancelTimerOperationOptions = {
  timeoutId: string
  timerDriver: RuntimeTimerDriver
  timers: Map<string, ActiveTimer>
}

type StartIntervalOperationOptions<IntervalId extends string> = {
  delay: number
  intervalId: IntervalId
  intervals: Map<string, ActiveTimer>
  nextToken: () => number
  onElapsed: (token: number) => Promise<void>
  timerDriver: RuntimeTimerDriver
}

type CancelIntervalOperationOptions = {
  intervalId: string
  intervals: Map<string, ActiveTimer>
  timerDriver: RuntimeTimerDriver
}

type StartFrameOperationOptions = {
  nextToken: () => number
  onFrame: (timestamp: number, token: number) => Promise<void>
  timerDriver: RuntimeTimerDriver
}

type CancelFrameOperationOptions = {
  frame: ActiveFrame | undefined
  timerDriver: RuntimeTimerDriver
}

type ClearScheduledOperationsOptions = {
  frame: ActiveFrame | undefined
  intervals: Map<string, ActiveTimer>
  timerDriver: RuntimeTimerDriver
  timers: Map<string, ActiveTimer>
}

export const startTimerOperation = <TimeoutId extends string>({
  delay,
  nextToken,
  onElapsed,
  timeoutId,
  timerDriver,
  timers,
}: StartTimerOperationOptions<TimeoutId>): void => {
  const token = nextToken()
  const handle = timerDriver.start(delay, () => onElapsed(token))

  timers.set(timeoutId, {
    delay,
    handle,
    token,
  })
}

export const cancelActiveTimerOperation = ({
  timeoutId,
  timerDriver,
  timers,
}: CancelTimerOperationOptions): TimerPayload<string> | undefined => {
  const activeTimer = timers.get(timeoutId)

  if (!activeTimer) {
    return
  }

  timerDriver.cancel(activeTimer.handle)
  timers.delete(timeoutId)

  return {
    delay: activeTimer.delay,
    timeoutId,
  }
}

export const replaceTimerOperation = ({
  timeoutId,
  timerDriver,
  timers,
}: CancelTimerOperationOptions): void => {
  const activeTimer = timers.get(timeoutId)

  if (!activeTimer) {
    return
  }

  timerDriver.cancel(activeTimer.handle)
  timers.delete(timeoutId)
}

export const startIntervalOperation = <IntervalId extends string>({
  delay,
  intervalId,
  intervals,
  nextToken,
  onElapsed,
  timerDriver,
}: StartIntervalOperationOptions<IntervalId>): void => {
  const token = nextToken()
  const handle = timerDriver.startInterval(delay, () => onElapsed(token))

  intervals.set(intervalId, {
    delay,
    handle,
    token,
  })
}

export const cancelActiveIntervalOperation = ({
  intervalId,
  intervals,
  timerDriver,
}: CancelIntervalOperationOptions): IntervalPayload<string> | undefined => {
  const activeInterval = intervals.get(intervalId)

  if (!activeInterval) {
    return
  }

  timerDriver.cancel(activeInterval.handle)
  intervals.delete(intervalId)

  return {
    delay: activeInterval.delay,
    intervalId,
  }
}

export const replaceIntervalOperation = ({
  intervalId,
  intervals,
  timerDriver,
}: CancelIntervalOperationOptions): void => {
  const activeInterval = intervals.get(intervalId)

  if (!activeInterval) {
    return
  }

  timerDriver.cancel(activeInterval.handle)
  intervals.delete(intervalId)
}

export const startFrameOperation = ({
  nextToken,
  onFrame,
  timerDriver,
}: StartFrameOperationOptions): ActiveFrame => {
  const token = nextToken()
  const handle = timerDriver.startFrame(timestamp => onFrame(timestamp, token))

  return {
    handle,
    token,
  }
}

export const cancelActiveFrameOperation = ({
  frame,
  timerDriver,
}: CancelFrameOperationOptions): void => {
  if (!frame) {
    return
  }

  timerDriver.cancel(frame.handle)
}

export const clearScheduledOperations = ({
  frame,
  intervals,
  timerDriver,
  timers,
}: ClearScheduledOperationsOptions): void => {
  timers.forEach(timer => {
    timerDriver.cancel(timer.handle)
  })

  intervals.forEach(interval => {
    timerDriver.cancel(interval.handle)
  })

  if (frame) {
    timerDriver.cancel(frame.handle)
  }

  timers.clear()
  intervals.clear()
}
