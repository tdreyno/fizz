export interface RuntimeAsyncDriver {
  cancel: (handle: unknown) => void
  start: <T>(options: {
    onReject: (error: unknown) => Promise<void> | void
    onResolve: (value: T) => Promise<void> | void
    run: () => Promise<T>
  }) => unknown
}

export interface ControlledAsyncDriver extends RuntimeAsyncDriver {
  flush: () => Promise<void>
  runAll: () => Promise<void>
}

export const createDefaultAsyncDriver = (): RuntimeAsyncDriver => ({
  cancel: handle => {
    ;(handle as { active?: boolean }).active = false
  },
  start: ({ onReject, onResolve, run }) => {
    const handle = { active: true }

    void run()
      .then(value => {
        if (handle.active) {
          return onResolve(value)
        }
      })
      .catch(error => {
        if (handle.active) {
          return onReject(error)
        }
      })

    return handle
  },
})

export const createControlledAsyncDriver = (): ControlledAsyncDriver => {
  let counter = 1

  const operations = new Map<
    number,
    {
      active: boolean
      pending: Array<() => Promise<void> | void>
    }
  >()

  const driver: ControlledAsyncDriver = {
    cancel: handle => {
      const operationId = handle as number
      const operation = operations.get(operationId)

      if (!operation) {
        return
      }

      operation.active = false
      operation.pending = []
      operations.delete(operationId)
    },

    start: ({ onReject, onResolve, run }) => {
      const operationId = counter++

      operations.set(operationId, {
        active: true,
        pending: [],
      })

      void run()
        .then(value => {
          const operation = operations.get(operationId)

          if (!operation?.active) {
            return
          }

          operation.pending.push(() => onResolve(value))
        })
        .catch(error => {
          const operation = operations.get(operationId)

          if (!operation?.active) {
            return
          }

          operation.pending.push(() => onReject(error))
        })

      return operationId
    },

    flush: async () => {
      await Promise.resolve()
      await Promise.resolve()

      const pending = [...operations.values()].flatMap(operation =>
        operation.active ? operation.pending.splice(0) : [],
      )

      for (const task of pending) {
        await task()
      }
    },

    runAll: async () => {
      while (
        [...operations.values()].some(operation => operation.pending.length > 0)
      ) {
        await driver.flush()
      }
    },
  }

  return driver
}
