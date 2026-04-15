import type {
  CancelAsyncEffectData,
  CancelIntervalEffectData,
  CancelTimerEffectData,
  Effect,
  RestartIntervalEffectData,
  RestartTimerEffectData,
  StartAsyncEffectData,
  StartIntervalEffectData,
  StartTimerEffectData,
} from "../effect.js"

type EffectHandlers<Command, OutputAction> = {
  emitOutput: (action: OutputAction) => void
  handleCancelAsync: (data: CancelAsyncEffectData<string>) => Command[]
  handleCancelFrame: () => Command[]
  handleCancelInterval: (data: CancelIntervalEffectData<string>) => Command[]
  handleCancelTimer: (data: CancelTimerEffectData<string>) => Command[]
  handleGoBack: () => Command[]
  handleRestartInterval: (data: RestartIntervalEffectData<string>) => Command[]
  handleRestartTimer: (data: RestartTimerEffectData<string>) => Command[]
  handleStartAsync: (data: StartAsyncEffectData<unknown, string>) => Command[]
  handleStartFrame: () => Command[]
  handleStartInterval: (data: StartIntervalEffectData<string>) => Command[]
  handleStartTimer: (data: StartTimerEffectData<string>) => Command[]
  runEffect: (effect: Effect<unknown>) => void
}

export const dispatchEffect = <Command, OutputAction>(
  item: Effect<unknown>,
  handlers: EffectHandlers<Command, OutputAction>,
): Command[] => {
  if (item.label === "goBack") {
    return handlers.handleGoBack()
  }

  if (item.label === "output") {
    handlers.emitOutput(item.data as OutputAction)

    return []
  }

  if (item.label === "startTimer") {
    return handlers.handleStartTimer(item.data as StartTimerEffectData<string>)
  }

  if (item.label === "startAsync") {
    return handlers.handleStartAsync(
      item.data as StartAsyncEffectData<unknown, string>,
    )
  }

  if (item.label === "cancelTimer") {
    return handlers.handleCancelTimer(
      item.data as CancelTimerEffectData<string>,
    )
  }

  if (item.label === "cancelAsync") {
    return handlers.handleCancelAsync(
      item.data as CancelAsyncEffectData<string>,
    )
  }

  if (item.label === "restartTimer") {
    return handlers.handleRestartTimer(
      item.data as RestartTimerEffectData<string>,
    )
  }

  if (item.label === "startInterval") {
    return handlers.handleStartInterval(
      item.data as StartIntervalEffectData<string>,
    )
  }

  if (item.label === "cancelInterval") {
    return handlers.handleCancelInterval(
      item.data as CancelIntervalEffectData<string>,
    )
  }

  if (item.label === "restartInterval") {
    return handlers.handleRestartInterval(
      item.data as RestartIntervalEffectData<string>,
    )
  }

  if (item.label === "startFrame") {
    return handlers.handleStartFrame()
  }

  if (item.label === "cancelFrame") {
    return handlers.handleCancelFrame()
  }

  handlers.runEffect(item)

  return []
}
