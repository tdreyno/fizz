export type WrappedHandlerStatus = "idle" | "pending" | "waiting"

/**
 * Models the lifecycle of a debounced or throttled handler per runtime instance.
 *
 * States:
 *   "idle"    – handler is not active; no timer is running.
 *   "waiting" – timer is running; no payload queued (throttle leading-edge fired,
 *               or first call with neither leading nor trailing active).
 *   "pending" – timer is running; a payload is queued for the next emission
 *               (debounce always, throttle trailing-edge).
 */
export type WrappedHandlerMachine<Payload> = {
  readonly pendingPayload: Payload | undefined
  readonly status: WrappedHandlerStatus
}

export const createWrappedHandlerMachine = <
  Payload,
>(): WrappedHandlerMachine<Payload> => ({
  pendingPayload: undefined,
  status: "idle",
})

/** Transition to "waiting": timer running, no payload queued. */
export const activateWrappedHandler = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): WrappedHandlerMachine<Payload> => ({
  ...machine,
  pendingPayload: undefined,
  status: "waiting",
})

/** Transition to "pending": timer running, payload queued. */
export const setPendingWrappedHandler = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
  payload: Payload,
): WrappedHandlerMachine<Payload> => ({
  ...machine,
  pendingPayload: payload,
  status: "pending",
})

/** Transition back to "idle" with no payload emitted (timer expired, nothing queued). */
export const resetWrappedHandler = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): WrappedHandlerMachine<Payload> => ({
  ...machine,
  pendingPayload: undefined,
  status: "idle",
})

/**
 * Fire the pending payload and reset to "idle".
 * Used by debounce when the timer expires.
 */
export const fireAndResetWrappedHandler = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): [WrappedHandlerMachine<Payload>, Payload] => [
  { pendingPayload: undefined, status: "idle" },
  machine.pendingPayload as Payload,
]

/**
 * Fire the pending payload and restart the "waiting" cycle.
 * Used by throttle trailing-edge when the timer expires with a queued payload.
 */
export const fireAndRestartWrappedHandler = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): [WrappedHandlerMachine<Payload>, Payload] => [
  { pendingPayload: undefined, status: "waiting" },
  machine.pendingPayload as Payload,
]

export const isWrappedHandlerIdle = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): boolean => machine.status === "idle"

export const isWrappedHandlerPending = <Payload>(
  machine: WrappedHandlerMachine<Payload>,
): boolean => machine.status === "pending"
