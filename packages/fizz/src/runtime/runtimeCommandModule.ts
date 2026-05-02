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
  type ChannelQueueEntry = {
    commandType: string
    latestOnlyKey?: string
    skip: () => void
    task: () => Promise<void>
  }

  type ChannelQueueState = {
    entries: ChannelQueueEntry[]
    pendingLatestOnlyKeys: Map<string, number>
  }

  const channelQueues = new Map<string, ChannelQueueState>()

  const indexPendingLatestOnlyKeys = (
    entries: ChannelQueueEntry[],
  ): Map<string, number> => {
    const pendingLatestOnlyKeys = new Map<string, number>()

    for (let index = 1; index < entries.length; index += 1) {
      const latestOnlyKey = entries[index]?.latestOnlyKey

      if (latestOnlyKey !== undefined) {
        pendingLatestOnlyKeys.set(latestOnlyKey, index)
      }
    }

    return pendingLatestOnlyKeys
  }

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
    const activeState = channelQueues.get(activeChannel)
    const activeQueue = activeState?.entries

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
      const nextState = channelQueues.get(activeChannel)
      const nextQueue = nextState?.entries

      if (!nextQueue || nextQueue.length === 0) {
        channelQueues.delete(activeChannel)

        return
      }

      nextQueue.shift()

      if (nextQueue.length === 0) {
        channelQueues.delete(activeChannel)

        return
      }

      nextState.pendingLatestOnlyKeys = indexPendingLatestOnlyKeys(nextQueue)

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
    const state = channelQueues.get(channel) ?? {
      entries: [],
      pendingLatestOnlyKeys: new Map<string, number>(),
    }

    channelQueues.set(channel, state)

    const queue = state.entries

    const { latestOnlyKey } = entry

    if (latestOnlyKey !== undefined) {
      const pendingIndex = state.pendingLatestOnlyKeys.get(latestOnlyKey)

      if (pendingIndex !== undefined) {
        options.emitMonitor({
          channel,
          commandType: entry.commandType,
          latestOnlyKey,
          type: "imperative-command-replaced",
        })
        queue[pendingIndex].skip()
        queue.splice(pendingIndex, 1, entry)
        state.pendingLatestOnlyKeys.set(latestOnlyKey, pendingIndex)

        return
      }
    }

    queue.push(entry)

    if (latestOnlyKey !== undefined && queue.length > 1) {
      state.pendingLatestOnlyKeys.set(latestOnlyKey, queue.length - 1)
    }

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

      const onQueuedCommandResolved = (result: unknown) => {
        options.emitMonitor({
          channel: data.channel,
          commandType: data.commandType,
          result,
          type: "imperative-command-completed",
        })

        return runMappedAction(data.handlers.resolve(result))
      }

      const onQueuedCommandRejected = (error: unknown) => {
        options.emitMonitor({
          channel: data.channel,
          commandType: data.commandType,
          error,
          type: "imperative-command-failed",
        })

        return runMappedAction(data.handlers.reject(error))
      }

      const task = () => {
        options.emitMonitor({
          channel: data.channel,
          commandType: data.commandType,
          payload: data.payload,
          type: "imperative-command-started",
        })

        try {
          const result = handler(data.payload)

          if (result instanceof Promise) {
            return result
              .then(onQueuedCommandResolved)
              .catch(onQueuedCommandRejected)
          }

          return onQueuedCommandResolved(result)
        } catch (error) {
          return onQueuedCommandRejected(error)
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
          await executeCommandEffect(effectItem.data, {
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
