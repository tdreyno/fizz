import type { RuntimeCommandLineage } from "./runtimeCommandLineage.js"
import type { RuntimeDebugCommand } from "./runtimeContracts.js"

export type RuntimeCommandMiddlewareContext = {
  command: RuntimeDebugCommand
  lineage: RuntimeCommandLineage | undefined
}

export type RuntimeCommandMiddlewareNext = () => Promise<RuntimeDebugCommand[]>

/**
 * A middleware function that intercepts command execution.
 * Call `next()` to continue down the pipeline; return a result without calling
 * `next()` to short-circuit execution.
 */
export type RuntimeCommandMiddleware = (
  context: RuntimeCommandMiddlewareContext,
  next: RuntimeCommandMiddlewareNext,
) => Promise<RuntimeDebugCommand[]>

/**
 * Composes an ordered list of middleware around a core execution function.
 * Middlewares run in registration order (first registered = outermost wrapper).
 */
export const composeCommandMiddleware = (
  middlewares: readonly RuntimeCommandMiddleware[],
  core: RuntimeCommandMiddlewareNext,
  context: RuntimeCommandMiddlewareContext,
): Promise<RuntimeDebugCommand[]> => {
  const dispatch = (index: number): Promise<RuntimeDebugCommand[]> => {
    if (index >= middlewares.length) return core()

    return middlewares[index](context, () => dispatch(index + 1))
  }

  return dispatch(0)
}
