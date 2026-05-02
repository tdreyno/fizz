export interface RuntimeTimerDriver {
  start: (delay: number, onElapsed: () => Promise<void> | void) => unknown
  startInterval: (
    delay: number,
    onElapsed: () => Promise<void> | void,
  ) => unknown
  startFrame: (
    onFrame: (timestamp: number) => Promise<void> | void,
    options?: { loop?: boolean },
  ) => unknown
  cancel: (handle: unknown) => void
}

export interface ControlledTimerDriver extends RuntimeTimerDriver {
  advanceBy: (ms: number) => Promise<void>
  advanceFrames: (count: number, frameMs?: number) => Promise<void>
  runAll: () => Promise<void>
}

type DefaultDriverHandle =
  | {
      handle: ReturnType<typeof setTimeout>
      kind: "timer"
    }
  | {
      handle: ReturnType<typeof setInterval>
      kind: "interval"
    }
  | {
      active: boolean
      handle: number | null
      kind: "frame"
      loop: boolean
    }

export const createDefaultTimerDriver = (): RuntimeTimerDriver => {
  const scheduleFrame = (
    frameHandle: Extract<DefaultDriverHandle, { kind: "frame" }>,
    onElapsed: (timestamp: number) => Promise<void> | void,
  ) => {
    frameHandle.handle = requestAnimationFrame(timestamp => {
      if (!frameHandle.active) {
        return
      }

      void onElapsed(timestamp)

      if (frameHandle.active && frameHandle.loop) {
        scheduleFrame(frameHandle, onElapsed)
      }
    })
  }

  return {
    start: (delay, onElapsed) => ({
      handle: setTimeout(() => {
        void onElapsed()
      }, delay),
      kind: "timer",
    }),
    startInterval: (delay, onElapsed) => ({
      handle: setInterval(() => {
        void onElapsed()
      }, delay),
      kind: "interval",
    }),
    startFrame: (onElapsed, options) => {
      const loop = options?.loop ?? false
      const handle: Extract<DefaultDriverHandle, { kind: "frame" }> = {
        active: true,
        handle: null,
        kind: "frame",
        loop,
      }

      scheduleFrame(handle, onElapsed)

      return handle
    },
    cancel: handle => {
      const driverHandle = handle as DefaultDriverHandle

      if (driverHandle.kind === "timer") {
        clearTimeout(driverHandle.handle)
        return
      }

      if (driverHandle.kind === "interval") {
        clearInterval(driverHandle.handle)
        return
      }

      driverHandle.active = false

      if (driverHandle.handle !== null) {
        cancelAnimationFrame(driverHandle.handle)
      }
    },
  }
}

export const createControlledTimerDriver = (): ControlledTimerDriver => {
  let now = 0
  let counter = 1

  const timers = new Map<
    number,
    {
      active: boolean
      delay: number
      dueAt: number
      onElapsed: () => Promise<void> | void
      repeats: boolean
    }
  >()
  const frames = new Map<
    number,
    {
      active: boolean
      loop: boolean
      onFrame: (timestamp: number) => Promise<void> | void
    }
  >()

  const driver: ControlledTimerDriver = {
    start: (delay, onElapsed) => {
      const id = counter++

      timers.set(id, {
        active: true,
        delay,
        dueAt: now + delay,
        onElapsed,
        repeats: false,
      })

      return id
    },

    startInterval: (delay, onElapsed) => {
      const id = counter++

      timers.set(id, {
        active: true,
        delay,
        dueAt: now + delay,
        onElapsed,
        repeats: true,
      })

      return id
    },

    startFrame: (onFrame, options) => {
      const id = counter++

      frames.set(id, {
        active: true,
        loop: options?.loop ?? false,
        onFrame,
      })

      return id
    },

    cancel: handle => {
      const timerId = handle as number
      const timer = timers.get(timerId)

      if (timer) {
        timer.active = false
        timers.delete(timerId)
        return
      }

      const frame = frames.get(timerId)

      if (!frame) {
        return
      }

      frame.active = false
      frames.delete(timerId)
    },

    advanceBy: async ms => {
      const target = now + ms

      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.active && timer.dueAt <= target)
          .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0]

        if (!next) {
          break
        }

        const [id, timer] = next

        now = timer.dueAt

        if (timer.repeats) {
          timer.dueAt += timer.delay
        } else {
          timers.delete(id)
        }

        await timer.onElapsed()
      }

      now = target
    },

    advanceFrames: async (count, frameMs = 16) => {
      for (let index = 0; index < count; index += 1) {
        now += frameMs

        const currentFrames = [...frames.entries()].filter(
          ([, frame]) => frame.active,
        )

        for (const [id, frame] of currentFrames) {
          if (!frames.has(id) || !frame.active) {
            continue
          }

          await frame.onFrame(now)

          if (!frame.loop && frames.has(id)) {
            frames.delete(id)
          }
        }
      }
    },

    runAll: async () => {
      while (timers.size > 0) {
        const nextDueAt = [...timers.values()]
          .filter(timer => timer.active)
          .sort((left, right) => left.dueAt - right.dueAt)[0]?.dueAt

        if (nextDueAt === undefined) {
          break
        }

        await driver.advanceBy(nextDueAt - now)
      }
    },
  }

  return driver
}
