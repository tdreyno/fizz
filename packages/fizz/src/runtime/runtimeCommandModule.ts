import type { Action } from "../action.js"
import type { CommandEffectData, CommandSchema, Effect } from "../effect.js"
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
  emitMonitor: (event: RuntimeDebugEvent) => void
  missingHandlerPolicy: RuntimeMissingCommandHandlerPolicy
  runAction: (action: Action<string, unknown>) => Promise<void>
}): RuntimeCommandModule => {
  const runMappedAction = async (action: Action<string, unknown> | void) => {
    if (!action) {
      return
    }

    await options.runAction(action)
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
        throw new Error(
          `Fizz missing command handler for ${data.channel}.${data.commandType}`,
        )
      }

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
  ]) as RuntimeEffectHandlerRegistry<RuntimeDebugCommand>

  return {
    clear: () => undefined,
    clearForGoBack: () => undefined,
    clearForTransition: () => undefined,
    effectHandlers,
  }
}
