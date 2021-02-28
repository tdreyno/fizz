/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalTask, Task } from "@tdreyno/pretty-please"
import { Action, isAction } from "./action"
import { Context } from "./context"
import { execute, ExecuteResult, processStateReturn, runEffects } from "./core"
import { Effect } from "./effect"
import { NoStatesRespondToAction, StateDidNotRespondToAction } from "./errors"
import { BoundStateFn, StateTransition } from "./state"

type ContextChangeSubscriber = (context: Context) => void

export interface Runtime {
  currentState: () => StateTransition<any, any, any>
  onContextChange: (fn: ContextChangeSubscriber) => void
  bindActions: <
    AM extends { [key: string]: (...args: any[]) => Action<any, any> }
  >(
    actions: AM,
  ) => AM
  disconnect: () => void
  run: (action: Action<any, any>) => Task<any, Effect[]>
  canHandle: (action: Action<any, any>) => boolean
  context: Context
}

export const createRuntime = (
  context: Context,
  validActionNames: string[] = [],
  fallback?: BoundStateFn<any, any, any>,
  parent?: Runtime,
): Runtime => {
  const subscriptions_ = new Map<string, () => void>()

  const pendingActions_: [Action<any, any>, ExternalTask<any, any>][] = []

  const contextChangeSubscribers_: Set<ContextChangeSubscriber> = new Set()

  let immediateId_: NodeJS.Immediate | undefined

  const validActions_ = validActionNames.reduce(
    (sum, action) => sum.add(action.toLowerCase()),
    new Set<string>(),
  )

  const handleSubscriptionEffect_ = (effect: Effect) => {
    switch (effect.label) {
      case "subscribe": {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,  @typescript-eslint/no-unsafe-assignment
        const name = effect.data[0]

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,  @typescript-eslint/no-unsafe-assignment
        const unsub = effect.data[1].subscribe((a: Action<any, any>) => run(a))

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,  @typescript-eslint/no-unsafe-assignment
        const callback = effect.data[2]

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        subscriptions_.set(name, () => unsub() && callback())
      }

      case "unsubscribe": {
        const unsub = subscriptions_.get(effect.data)

        if (unsub) {
          unsub()
        }
      }
    }
  }

  const chainResults_ = (result: ExecuteResult): Task<any, Effect[]> =>
    Task.sequence(result[1])
      .chain(results => {
        const joinedResults = results.reduce(
          (sum, item) => {
            if (isAction(item)) {
              sum[1].push(run(item))
              return sum
            } else {
              return processStateReturn(context, sum, item)
            }
          },
          [result[0], []] as ExecuteResult,
        )

        if (joinedResults[1].length > 0) {
          return chainResults_(joinedResults)
        }

        return Task.of(joinedResults[0])
      })
      .tap(effects => {
        runEffects(context, effects)

        effects.forEach(handleSubscriptionEffect_)
      })

  const flushPendingActions_ = () => {
    if (pendingActions_.length <= 0) {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [action, task] = pendingActions_.shift()!

    // Make sure we're in a valid state.
    validateCurrentState_()

    try {
      return chainResults_(executeAction_(action)).fork(
        error => {
          task.reject(error)

          pendingActions_.length = 0
        },
        results => {
          task.resolve(results)

          contextChangeSubscribers_.forEach(sub => sub(context))

          flushPendingActions_()
        },
      )
    } catch (e) {
      task.reject(e)

      pendingActions_.length = 0
    }
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

          if (parent) {
            try {
              // Run on parent and throw away effects.
              void parent.run(e.action)

              return [[], []]
            } catch (e3) {
              if (!(e3 instanceof StateDidNotRespondToAction)) {
                throw e3
              }

              throw new NoStatesRespondToAction(
                [currentState(), fallbackState, parent.currentState()],
                e.action,
              )
            }
          } else {
            throw new NoStatesRespondToAction(
              [currentState(), fallbackState],
              e.action,
            )
          }
        }
      }

      if (parent) {
        // If we failed either previous step without responding,
        // and we have a parent runtime. Try running that.
        try {
          // Run on parent
          return [[], [parent.run(e.action)]]
        } catch (e3) {
          if (!(e3 instanceof StateDidNotRespondToAction)) {
            throw e3
          }

          throw new NoStatesRespondToAction(
            [currentState(), parent.currentState()],
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

  const run = (action: Action<any, any>): Task<any, Effect[]> => {
    const task = Task.external<any, Effect[]>()

    pendingActions_.push([action, task])

    if (immediateId_) {
      clearImmediate(immediateId_)
    }

    immediateId_ = setImmediate(flushPendingActions_)

    return task
  }

  const bindActions = <
    AM extends { [key: string]: (...args: any[]) => Action<any, any> }
  >(
    actions: AM,
  ): AM =>
    Object.keys(actions).reduce((sum, key) => {
      sum[key] = (...args: any[]) => {
        try {
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
