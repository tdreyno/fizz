import type { RuntimeAction } from "./runtimeContracts.js"

export type OutputSubscriber<
  OAM extends RuntimeActionMap,
  OA extends RuntimeAction = ReturnType<OAM[keyof OAM]>,
> = (action: OA) => void | Promise<void>

export type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => RuntimeAction
}

type RuntimeOutputAction<OAM extends RuntimeActionMap> = ReturnType<
  OAM[keyof OAM]
>

type OutputTypeChannel<T extends string> =
  T extends `${infer Channel}.${string}` ? Channel : never

type OutputTypeCommand<
  T extends string,
  Channel extends string,
> = T extends `${Channel}.${infer CommandType}` ? CommandType : never

type OutputPayloadFor<
  OA extends RuntimeAction,
  Channel extends string,
  CommandType extends string,
> =
  Extract<OA, { type: `${Channel}.${CommandType}` }> extends {
    payload: infer Payload
  }
    ? Payload
    : never

type OutputChannelHandlers<OA extends RuntimeAction> = {
  [Channel in OutputTypeChannel<OA["type"]>]?: {
    [CommandType in OutputTypeCommand<OA["type"], Channel>]?: (
      payload: OutputPayloadFor<OA, Channel, CommandType>,
    ) => void | Promise<void>
  }
}

type RuntimeOutputChannelHandlers = Record<
  string,
  Record<string, (payload: unknown) => void | Promise<void>>
>

/**
 * Manages output routing: subscribers, type filters, and channel handlers.
 * Separates output delivery logic from runtime state management.
 *
 * @internal
 */
export class RuntimeOutputRouter<OAM extends RuntimeActionMap> {
  readonly #outputSubscribers = new Set<OutputSubscriber<OAM>>()

  onOutput(fn: OutputSubscriber<OAM>): () => void {
    this.#outputSubscribers.add(fn)
    return () => this.#outputSubscribers.delete(fn)
  }

  onOutputType<OA extends ReturnType<OAM[keyof OAM]>, T extends OA["type"]>(
    type: T,
    handler: (
      payload: Extract<OA, { type: T }>["payload"],
    ) => void | Promise<void>,
  ): () => void {
    return this.onOutput(async output => {
      if (output.type === type) {
        await handler((output as Extract<OA, { type: T }>).payload)
      }
    })
  }

  connectOutputChannel<
    Handlers extends OutputChannelHandlers<RuntimeOutputAction<OAM>>,
  >(handlers: Handlers): () => void {
    const typedHandlers = handlers as unknown as RuntimeOutputChannelHandlers

    return this.onOutput(async output => {
      const separatorIndex = output.type.indexOf(".")

      if (separatorIndex < 1 || separatorIndex === output.type.length - 1) {
        return
      }

      const channel = output.type.slice(0, separatorIndex)
      const commandType = output.type.slice(separatorIndex + 1)
      const channelHandlers = typedHandlers[channel]

      if (channelHandlers === undefined) {
        return
      }

      const commandHandler = channelHandlers[commandType]

      if (commandHandler === undefined) {
        return
      }

      await commandHandler(output.payload)
    })
  }

  async emit(output: ReturnType<OAM[keyof OAM]>): Promise<void> {
    const promises: Array<Promise<void>> = []

    this.#outputSubscribers.forEach(sub => {
      const result = sub(output)
      if (result instanceof Promise) {
        promises.push(result)
      }
    })

    await Promise.all(promises)
  }

  disconnect(): void {
    this.#outputSubscribers.clear()
  }
}
