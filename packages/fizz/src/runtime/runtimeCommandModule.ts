import type { Action } from "../action.js"
import type {
  CommandEffectData,
  CommandSchema,
  Effect,
  EffectBatchEffectData,
} from "../effect.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeMissingCommandHandlerPolicy,
  RuntimeState,
} from "./runtimeContracts.js"

export type RuntimeCommandHandler<Result = unknown> = (
  payload: unknown,
) => Result | Promise<Result>

export type RuntimeCommandHandlers = Record<
  string,
  Record<string, RuntimeCommandHandler>
>

export type RuntimeCommandHandlersFromClients<Schema extends CommandSchema> = {
  [Channel in Extract<keyof Schema, string>]: {
    [CommandType in Extract<keyof Schema[Channel], string>]: (
      payload: Schema[Channel][CommandType]["payload"],
    ) =>
      | Schema[Channel][CommandType]["result"]
      | Promise<Schema[Channel][CommandType]["result"]>
  }
}

export const commandHandlersFromClients = <Schema extends CommandSchema>(
  clients: RuntimeCommandHandlersFromClients<Schema>,
): RuntimeCommandHandlersFromClients<Schema> => clients

export type RuntimeCommandModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

export const createRuntimeCommandModule = (options: {
  actionCommand: (action: Action<string, unknown>) => RuntimeDebugCommand
  commandHandlers: RuntimeCommandHandlers
  emitOutput: (action: Action<string, unknown>) => void
  emitMonitor: (event: RuntimeDebugEvent) => void
  missingHandlerPolicy: RuntimeMissingCommandHandlerPolicy
  runAction: (action: Action<string, unknown>) => Promise<void>
}): RuntimeCommandModule => {
  const channelQueues = new Map<
    string,
    Array<{
      commandType: string
      latestOnlyKey?: string
      skip: () => void
      task: () => Promise<void>
    }>
  >()

  const runMappedAction = async (action: Action<string, unknown> | void) => {
    if (!action) {
      return
    }

    await options.runAction(action)
  }

  const emitMappedOutput = (action: Action<string, unknown> | void) => {
    if (!action) {
      return
    }

    options.emitOutput(action)
  }

  const drainChannelQueue = (activeChannel: string): void => {
    const activeQueue = channelQueues.get(activeChannel)

    if (!activeQueue || activeQueue.length === 0) {
      channelQueues.delete(activeChannel)

      return
    }

    const currentEntry = activeQueue[0]

    if (!currentEntry) {
      channelQueues.delete(activeChannel)

      return
    }

    void currentEntry.task().finally(() => {
      const nextQueue = channelQueues.get(activeChannel)

      if (!nextQueue || nextQueue.length === 0) {
        channelQueues.delete(activeChannel)

        return
      }

      nextQueue.shift()

      if (nextQueue.length === 0) {
        channelQueues.delete(activeChannel)

        return
      }

      drainChannelQueue(activeChannel)
    })
  }

  const enqueueChannelTask = (
    channel: string,
    entry: {
      commandType: string
      latestOnlyKey?: string
      skip: () => void
      task: () => Promise<void>
    },
  ): void => {
    const queue = channelQueues.get(channel) ?? []

    channelQueues.set(channel, queue)

    const { latestOnlyKey } = entry

    // Replace a pending entry with the same key (index 0 is running - never touch it).
    if (latestOnlyKey !== undefined && queue.length > 1) {
      const pendingIndex = queue.findIndex(
        (e, i) => i > 0 && e.latestOnlyKey === latestOnlyKey,
      )

      if (pendingIndex !== -1) {
        options.emitMonitor({
          channel,
          commandType: entry.commandType,
          latestOnlyKey,
          type: "imperative-command-replaced",
        })
        queue[pendingIndex]!.skip()
        queue.splice(pendingIndex, 1, entry)

        return
      }
    }

    queue.push(entry)

    if (queue.length === 1) {
      drainChannelQueue(channel)
    }
  }

  const executeCommandEffect = async (
    data: CommandEffectData<
      string,
      string,
      unknown,
      unknown,
      Action<string, unknown> | void,
      Action<string, unknown> | void
    >,
    optionsOverride: {
      failOnError: boolean
      failOnMissingHandler: boolean
    },
  ): Promise<RuntimeDebugCommand[]> => {
    options.emitMonitor({
      channel: data.channel,
      commandType: data.commandType,
      payload: data.payload,
      type: "imperative-command-started",
    })

    const handler = options.commandHandlers[data.channel]?.[data.commandType]

    if (!handler) {
      options.emitMonitor({
        channel: data.channel,
        commandType: data.commandType,
        policy: options.missingHandlerPolicy,
        type: "imperative-command-missing-handler",
      })

      if (options.missingHandlerPolicy === "warn") {
        console.warn(
          `Fizz missing command handler for ${data.channel}.${data.commandType}`,
        )
      }

      if (options.missingHandlerPolicy === "error") {
        const error = new Error(
          `Fizz missing command handler for ${data.channel}.${data.commandType}`,
        )

        if (optionsOverride.failOnMissingHandler) {
          throw error
        }

        return []
      }

      return []
    }

    try {
      const result = await handler(data.payload)

      options.emitMonitor({
        channel: data.channel,
        commandType: data.commandType,
        result,
        type: "imperative-command-completed",
      })

      if (optionsOverride.failOnError) {
        await runMappedAction(data.handlers.resolve(result))

        return []
      }

      const action = data.handlers.resolve(result)

      return action ? [options.actionCommand(action)] : []
    } catch (error) {
      options.emitMonitor({
        channel: data.channel,
        commandType: data.commandType,
        error,
        type: "imperative-command-failed",
      })

      if (optionsOverride.failOnError) {
        await runMappedAction(data.handlers.reject(error))
        throw error
      }

      const action = data.handlers.reject(error)

      return action ? [options.actionCommand(action)] : []
    }
  }

  const isCommandEffectData = (
    value: unknown,
  ): value is CommandEffectData<
    string,
    string,
    unknown,
    unknown,
    Action<string, unknown> | void,
    Action<string, unknown> | void
  > => {
    if (!value || typeof value !== "object") {
      return false
    }

    const data = value as {
      channel?: unknown
      commandType?: unknown
      handlers?: unknown
      payload?: unknown
    }

    return (
      typeof data.channel === "string" &&
      typeof data.commandType === "string" &&
      data.handlers !== undefined &&
      "payload" in data
    )
  }

  const handleMissingCommandHandler = (
    channel: string,
    commandType: string,
  ): void => {
    options.emitMonitor({
      channel,
      commandType,
      policy: options.missingHandlerPolicy,
      type: "imperative-command-missing-handler",
    })

    if (options.missingHandlerPolicy === "warn") {
      console.warn(`Fizz missing command handler for ${channel}.${commandType}`)
    }

    if (options.missingHandlerPolicy === "error") {
      throw new Error(
        `Fizz missing command handler for ${channel}.${commandType}`,
      )
    }
  }

  const handleCommandEffect = (
    data: CommandEffectData<
      string,
      string,
      unknown,
      unknown,
      Action<string, unknown> | void,
      Action<string, unknown> | void
    >,
  ): RuntimeDebugCommand[] => {
    // Queued path: when latestOnlyKey is set, defer onto the channel queue so
    // pending commands with the same key can be replaced before they execute.
    if (data.latestOnlyKey !== undefined) {
      const handler = options.commandHandlers[data.channel]?.[data.commandType]

      if (!handler) {
        handleMissingCommandHandler(data.channel, data.commandType)

        return []
      }

      const task = async () => {
        options.emitMonitor({
          channel: data.channel,
          commandType: data.commandType,
          payload: data.payload,
          type: "imperative-command-started",
        })

        try {
          const result = await handler(data.payload)

          options.emitMonitor({
            channel: data.channel,
            commandType: data.commandType,
            result,
            type: "imperative-command-completed",
          })

          await runMappedAction(data.handlers.resolve(result))
        } catch (error) {
          options.emitMonitor({
            channel: data.channel,
            commandType: data.commandType,
            error,
            type: "imperative-command-failed",
          })

          await runMappedAction(data.handlers.reject(error))
        }
      }

      enqueueChannelTask(data.channel, {
        commandType: data.commandType,
        latestOnlyKey: data.latestOnlyKey,
        skip: () => undefined,
        task,
      })

      return []
    }

    // Standard path: run immediately (preserves sync return for sync handlers).
    options.emitMonitor({
      channel: data.channel,
      commandType: data.commandType,
      payload: data.payload,
      type: "imperative-command-started",
    })

    const handler = options.commandHandlers[data.channel]?.[data.commandType]

    if (!handler) {
      handleMissingCommandHandler(data.channel, data.commandType)

      return []
    }

    try {
      const result = handler(data.payload)

      if (result instanceof Promise) {
        void result
          .then(async resolved => {
            options.emitMonitor({
              channel: data.channel,
              commandType: data.commandType,
              result: resolved,
              type: "imperative-command-completed",
            })

            await runMappedAction(data.handlers.resolve(resolved))
          })
          .catch(async error => {
            options.emitMonitor({
              channel: data.channel,
              commandType: data.commandType,
              error,
              type: "imperative-command-failed",
            })

            await runMappedAction(data.handlers.reject(error))
          })

        return []
      }

      options.emitMonitor({
        channel: data.channel,
        commandType: data.commandType,
        result,
        type: "imperative-command-completed",
      })

      const action = data.handlers.resolve(result)

      return action ? [options.actionCommand(action)] : []
    } catch (error) {
      options.emitMonitor({
        channel: data.channel,
        commandType: data.commandType,
        error,
        type: "imperative-command-failed",
      })

      const action = data.handlers.reject(error)

      return action ? [options.actionCommand(action)] : []
    }
  }

  const handleEffectBatch = (
    data: EffectBatchEffectData<
      Action<string, unknown> | void,
      Action<string, unknown> | void,
      Action<string, unknown> | void,
      Action<string, unknown> | void
    >,
  ): RuntimeDebugCommand[] => {
    const isBatchCommandEffect = (
      effectItem: Effect<unknown>,
    ): effectItem is Effect<
      CommandEffectData<
        string,
        string,
        unknown,
        unknown,
        Action<string, unknown> | void,
        Action<string, unknown> | void
      >
    > =>
      effectItem.label === "commandEffect" &&
      isCommandEffectData(effectItem.data)

    const batchValidationError = (effectItem: Effect<unknown>): Error => {
      if (effectItem.label === "commandEffect") {
        return new Error("effectBatch received commandEffect with invalid data")
      }

      return new Error(
        `effectBatch only supports commandEffect items. Received ${effectItem.label}`,
      )
    }

    const runBatchEffect = async (
      data: EffectBatchEffectData<
        Action<string, unknown> | void,
        Action<string, unknown> | void,
        Action<string, unknown> | void,
        Action<string, unknown> | void
      >,
    ): Promise<unknown> => {
      let firstBatchError: unknown

      for (const effectItem of data.effects) {
        if (!isBatchCommandEffect(effectItem)) {
          const validationError = batchValidationError(effectItem)

          firstBatchError = firstBatchError ?? validationError

          if (data.onError === "failBatch") {
            break
          }

          continue
        }

        try {
          await executeCommandEffect(effectItem.data!, {
            failOnError: true,
            failOnMissingHandler: true,
          })
        } catch (error) {
          firstBatchError = firstBatchError ?? error

          if (data.onError === "failBatch") {
            break
          }
        }
      }

      return firstBatchError
    }

    const runBatchSignals = async (
      data: EffectBatchEffectData<
        Action<string, unknown> | void,
        Action<string, unknown> | void,
        Action<string, unknown> | void,
        Action<string, unknown> | void
      >,
      batchError: unknown,
    ): Promise<void> => {
      if (batchError === undefined) {
        await runMappedAction(data.handlers.resolveAction())
        emitMappedOutput(data.handlers.resolveOutput())

        return
      }

      await runMappedAction(data.handlers.rejectAction(batchError))
      emitMappedOutput(data.handlers.rejectOutput(batchError))
    }

    const runBatch = async () => {
      const batchError = await runBatchEffect(data)

      await runBatchSignals(data, batchError)
    }

    if (!data.channel) {
      void runBatch()

      return []
    }

    enqueueChannelTask(data.channel, {
      commandType: "effectBatch",
      latestOnlyKey: data.latestOnlyKey,
      skip: () => undefined,
      task: runBatch,
    })

    return []
  }

  const effectHandlers = new Map<
    string,
    (item: Effect<unknown>) => RuntimeDebugCommand[]
  >([
    [
      "commandEffect",
      item =>
        handleCommandEffect(
          item.data as CommandEffectData<
            string,
            string,
            unknown,
            unknown,
            Action<string, unknown> | void,
            Action<string, unknown> | void
          >,
        ),
    ],
    [
      "effectBatch",
      item =>
        handleEffectBatch(
          item.data as EffectBatchEffectData<
            Action<string, unknown> | void,
            Action<string, unknown> | void,
            Action<string, unknown> | void,
            Action<string, unknown> | void
          >,
        ),
    ],
  ]) as RuntimeEffectHandlerRegistry<RuntimeDebugCommand>

  return {
    clear: () => undefined,
    clearForGoBack: () => undefined,
    clearForTransition: () => undefined,
    effectHandlers,
  }
}
