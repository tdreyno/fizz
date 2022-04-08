import { Action, isAction } from "./action.js"
import { BoundStateFn, StateReturn, StateTransition } from "./state.js"
import { ExternalPromise, externalPromise, isNotEmpty } from "./util.js"
import {
  NoStatesRespondToAction,
  StateDidNotRespondToAction,
} from "./errors.js"
import { execute, processStateReturn, runEffects } from "./core.js"

import { Context } from "./context.js"
import { Effect } from "./effect.js"
import { ExecuteResult } from "./execute-result.js"

type ContextChangeSubscriber = (context: Context) => void

export interface Runtime {
  currentState: () => StateTransition<any, any, any>
  onContextChange: (fn: ContextChangeSubscriber) => () => void
  bindActions: <
    AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  >(
    actions: AM,
  ) => AM
  disconnect: () => void
  run: (action: Action<any, any>) => Promise<Array<Effect>>
  canHandle: (action: Action<any, any>) => boolean
  context: Context
}

export const createRuntime = (
  context: Context,
  validActionNames: Array<string> = [],
  fallback?: BoundStateFn<any, any, any>,
): Runtime => {
  const pendingActions_: Array<[Action<any, any>, ExternalPromise<any>]> = []

  const contextChangeSubscribers_: Set<ContextChangeSubscriber> = new Set()

  let timeoutId_: number | NodeJS.Timeout | undefined

  const validActions_ = validActionNames.reduce(
    (sum, action) => sum.add(action.toLowerCase()),
    new Set<string>(),
  )

  const chainResults_ = async ({
    effects,
    promises,
  }: ExecuteResult): Promise<Array<Effect>> => {
    const results: void | StateReturn | StateReturn[] = await Promise.all(
      promises,
    )

    const joinedResults = results.reduce(
      (sum, item) =>
        isAction(item)
          ? sum.pushPromise(run(item))
          : processStateReturn(context, sum, item),
      ExecuteResult(effects),
    )

    let effectsToRun: Promise<Array<Effect>>

    if (joinedResults.promises.length > 0) {
      effectsToRun = chainResults_(joinedResults)
    } else {
      effectsToRun = Promise.resolve(joinedResults.effects)
    }

    const effectResults = await effectsToRun

    runEffects(context, effectResults)

    return effectResults
  }

  const flushPendingActions_ = () => {
    if (!isNotEmpty(pendingActions_)) {
      return
    }

    const [action, extPromise] = pendingActions_.shift()

    // Make sure we're in a valid state.
    validateCurrentState_()

    void chainResults_(executeAction_(action))
      .then(results => {
        extPromise.resolve(results)

        contextChangeSubscribers_.forEach(sub => sub(context))

        flushPendingActions_()
      })
      .catch(e => {
        extPromise.reject(e)

        pendingActions_.length = 0
      })
  }

  const validateCurrentState_ = () => {
    const runCurrentState = currentState()

    if (!runCurrentState) {
      throw new Error(
        `Fizz could not find current state to run action on. History: ${JSON.stringify(
          currentHistory()
            .map(({ name }) => name as string)
            .join(" -> "),
        )}`,
      )
    }
  }

  const executeAction_ = (action: Action<any, any>): ExecuteResult => {
    // Try this runtime.
    try {
      return execute(action, context)
    } catch (e) {
      // If it failed to handle optional actions like OnFrame, continue.
      if (!(e instanceof StateDidNotRespondToAction)) {
        throw e
      }

      // If we failed the last step by not responding, and we have
      // a fallback, try it.
      if (fallback) {
        const fallbackState = fallback(currentState())

        try {
          return execute(e.action, context, fallbackState)
        } catch (e2) {
          if (!(e2 instanceof StateDidNotRespondToAction)) {
            throw e2
          }

          throw new NoStatesRespondToAction(
            [currentState(), fallbackState],
            e.action,
          )
        }
      }

      throw new NoStatesRespondToAction([currentState()], e.action)
    }
  }

  const onContextChange = (fn: ContextChangeSubscriber) => {
    contextChangeSubscribers_.add(fn)

    return () => contextChangeSubscribers_.delete(fn)
  }

  const disconnect = () => contextChangeSubscribers_.clear()

  const currentState = () => context.currentState

  const currentHistory = () => context.history

  const canHandle = (action: Action<any, any>): boolean =>
    validActions_.has((action.type as string).toLowerCase())

  const run = (action: Action<any, any>): Promise<Array<Effect>> => {
    const extPromise = externalPromise<Array<Effect>>()

    pendingActions_.push([action, extPromise])

    if (timeoutId_) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      clearTimeout(timeoutId_ as any)
    }

    timeoutId_ = setTimeout(flushPendingActions_, 0)

    return extPromise.promise
  }

  const bindActions = <
    AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  >(
    actions: AM,
  ): AM =>
    Object.keys(actions).reduce((sum, key) => {
      sum[key] = (...args: Array<any>) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return run(actions[key](...args))
        } catch (e) {
          if (e instanceof NoStatesRespondToAction) {
            if (context.customLogger) {
              context.customLogger([e.toString()], "error")
            } else if (!context.disableLogging) {
              console.error(e.toString())
            }

            return
          }

          throw e
        }
      }

      return sum
    }, {} as Record<string, any>) as AM

  return {
    currentState,
    onContextChange,
    bindActions,
    disconnect,
    run,
    canHandle,
    context,
  }
}
