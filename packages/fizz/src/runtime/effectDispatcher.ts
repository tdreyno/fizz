import type {
  CancelAsyncEffectData,
  CancelIntervalEffectData,
  CancelTimerEffectData,
  Effect,
  RestartIntervalEffectData,
  RestartTimerEffectData,
  StartAsyncEffectData,
  StartFrameEffectData,
  StartIntervalEffectData,
  StartTimerEffectData,
} from "../effect.js"

export type RuntimeEffectHandler<Command> = (item: Effect<unknown>) => Command[]

export type RuntimeEffectHandlerRegistry<Command> = Map<
  string,
  RuntimeEffectHandler<Command>
>

type EffectHandlers<Command, OutputAction> = {
  emitOutput?: (action: OutputAction) => void
  handleCancelAsync?: (data: CancelAsyncEffectData<string>) => Command[]
  handleCancelFrame?: () => Command[]
  handleCancelInterval?: (data: CancelIntervalEffectData<string>) => Command[]
  handleCancelTimer?: (data: CancelTimerEffectData<string>) => Command[]
  handleGoBack?: () => Command[]
  handleRestartInterval?: (data: RestartIntervalEffectData<string>) => Command[]
  handleRestartTimer?: (data: RestartTimerEffectData<string>) => Command[]
  handleStartAsync?: (data: StartAsyncEffectData<unknown, string>) => Command[]
  handleStartFrame?: (data: StartFrameEffectData) => Command[]
  handleStartInterval?: (data: StartIntervalEffectData<string>) => Command[]
  handleStartTimer?: (data: StartTimerEffectData<string>) => Command[]
}

export const createEffectHandlerRegistry = <Command, OutputAction>(
  handlers: EffectHandlers<Command, OutputAction>,
): RuntimeEffectHandlerRegistry<Command> => {
  const registry = new Map<string, RuntimeEffectHandler<Command>>()

  if (handlers.handleGoBack) {
    registry.set("goBack", () => handlers.handleGoBack?.() ?? [])
  }

  if (handlers.emitOutput) {
    registry.set("output", item => {
      handlers.emitOutput?.(item.data as OutputAction)

      return []
    })
  }

  if (handlers.handleStartTimer) {
    registry.set(
      "startTimer",
      item =>
        handlers.handleStartTimer?.(
          item.data as StartTimerEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleStartAsync) {
    registry.set(
      "startAsync",
      item =>
        handlers.handleStartAsync?.(
          item.data as StartAsyncEffectData<unknown, string>,
        ) ?? [],
    )
  }

  if (handlers.handleCancelTimer) {
    registry.set(
      "cancelTimer",
      item =>
        handlers.handleCancelTimer?.(
          item.data as CancelTimerEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleCancelAsync) {
    registry.set(
      "cancelAsync",
      item =>
        handlers.handleCancelAsync?.(
          item.data as CancelAsyncEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleRestartTimer) {
    registry.set(
      "restartTimer",
      item =>
        handlers.handleRestartTimer?.(
          item.data as RestartTimerEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleStartInterval) {
    registry.set(
      "startInterval",
      item =>
        handlers.handleStartInterval?.(
          item.data as StartIntervalEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleCancelInterval) {
    registry.set(
      "cancelInterval",
      item =>
        handlers.handleCancelInterval?.(
          item.data as CancelIntervalEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleRestartInterval) {
    registry.set(
      "restartInterval",
      item =>
        handlers.handleRestartInterval?.(
          item.data as RestartIntervalEffectData<string>,
        ) ?? [],
    )
  }

  if (handlers.handleStartFrame) {
    registry.set(
      "startFrame",
      item =>
        handlers.handleStartFrame?.(item.data as StartFrameEffectData) ?? [],
    )
  }

  if (handlers.handleCancelFrame) {
    registry.set("cancelFrame", () => handlers.handleCancelFrame?.() ?? [])
  }

  return registry
}

export const registerEffectHandlers = <Command>(
  registry: RuntimeEffectHandlerRegistry<Command>,
  handlers: RuntimeEffectHandlerRegistry<Command>,
): void => {
  handlers.forEach((handler, label) => {
    if (registry.has(label)) {
      throw new Error(`Effect handler already registered for ${label}`)
    }

    registry.set(label, handler)
  })
}

export const dispatchEffect = <Command>(
  item: Effect<unknown>,
  options: {
    registry: RuntimeEffectHandlerRegistry<Command>
    runEffect: (effect: Effect<unknown>) => void
  },
): Command[] => {
  const handler = options.registry.get(item.label)

  if (!handler) {
    options.runEffect(item)

    return []
  }

  return handler(item)
}
