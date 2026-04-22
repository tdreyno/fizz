export type TimerStatus = "inactive" | "scheduled" | "completed" | "cancelled"

export type IntervalStatus = "inactive" | "scheduled" | "cancelled"

export type FrameStatus = "inactive" | "active" | "cancelled"

export type TimerMachine = {
  status: TimerStatus
  timeoutId: string
  token: number
}

export type IntervalMachine = {
  intervalId: string
  status: IntervalStatus
  token: number
}

export type FrameMachine = {
  status: FrameStatus
  token: number
}

type TokenStateMachine = {
  status: string
  token: number
}

const withStatusAndToken = <T extends TokenStateMachine>(
  machine: T,
  status: T["status"],
  token: number,
): T => ({
  ...machine,
  status,
  token,
})

const withStatusIfTokenMatches = <T extends TokenStateMachine>(
  machine: T,
  expectedStatus: T["status"],
  nextStatus: T["status"],
  token: number,
): T => {
  if (machine.status !== expectedStatus || machine.token !== token) {
    return machine
  }

  return {
    ...machine,
    status: nextStatus,
  }
}

const canHandleTokenWhileActive = (
  machine: TokenStateMachine,
  token: number,
): boolean =>
  (machine.status === "scheduled" || machine.status === "active") &&
  machine.token === token

const touchIfTokenMatches = <T extends TokenStateMachine>(
  machine: T,
  token: number,
): T => {
  if (!canHandleTokenWhileActive(machine, token)) {
    return machine
  }

  return {
    ...machine,
  }
}

export const createTimerMachine = (timeoutId: string): TimerMachine => ({
  status: "inactive",
  timeoutId,
  token: 0,
})

export const createIntervalMachine = (intervalId: string): IntervalMachine => ({
  intervalId,
  status: "inactive",
  token: 0,
})

export const createFrameMachine = (): FrameMachine => ({
  status: "inactive",
  token: 0,
})

export const scheduleTimer = (
  machine: TimerMachine,
  token: number,
): TimerMachine => withStatusAndToken(machine, "scheduled", token)

export const completeTimer = (
  machine: TimerMachine,
  token: number,
): TimerMachine =>
  withStatusIfTokenMatches(machine, "scheduled", "completed", token)

export const cancelTimer = (
  machine: TimerMachine,
  token: number,
): TimerMachine =>
  withStatusIfTokenMatches(machine, "scheduled", "cancelled", token)

export const scheduleInterval = (
  machine: IntervalMachine,
  token: number,
): IntervalMachine => withStatusAndToken(machine, "scheduled", token)

export const triggerInterval = (
  machine: IntervalMachine,
  token: number,
): IntervalMachine => touchIfTokenMatches(machine, token)

export const cancelInterval = (
  machine: IntervalMachine,
  token: number,
): IntervalMachine =>
  withStatusIfTokenMatches(machine, "scheduled", "cancelled", token)

export const activateFrame = (
  machine: FrameMachine,
  token: number,
): FrameMachine => withStatusAndToken(machine, "active", token)

export const triggerFrame = (
  machine: FrameMachine,
  token: number,
): FrameMachine => touchIfTokenMatches(machine, token)

export const cancelFrame = (
  machine: FrameMachine,
  token: number,
): FrameMachine =>
  withStatusIfTokenMatches(machine, "active", "cancelled", token)

export const canHandleScheduledTokenEvent = (
  machine: FrameMachine | IntervalMachine | TimerMachine,
  token: number,
): boolean => canHandleTokenWhileActive(machine, token)
