import { UnknownStateReturnType } from "../errors.js"
import type { RuntimeAction, RuntimeDebugCommand } from "./runtimeContracts.js"

type RuntimeCommandHandlers<Command> = {
  handleAction: (action: RuntimeAction) => Promise<Command[]>
  handleEffect: (
    effect: Extract<RuntimeDebugCommand, { kind: "effect" }>["effect"],
  ) => Promise<Command[]>
  handleState: (
    state: Extract<RuntimeDebugCommand, { kind: "state" }>["state"],
  ) => Promise<Command[]>
}

export const executeRuntimeCommand = async <Command>(
  item: RuntimeDebugCommand,
  handlers: RuntimeCommandHandlers<Command>,
): Promise<Command[]> => {
  if (item.kind === "action") {
    return handlers.handleAction(item.action)
  }

  if (item.kind === "state") {
    return handlers.handleState(item.state)
  }

  if (item.kind === "effect") {
    return handlers.handleEffect(item.effect)
  }

  throw new UnknownStateReturnType(item)
}
