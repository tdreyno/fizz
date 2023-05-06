import {
  createAction,
  type ActionCreatorType,
  type ActionCreator,
  type GetActionCreatorType,
  type Enter,
} from "./action.js"
import { output, noop } from "./effect.js"
import { type HandlerReturn } from "./core.js"
import { state } from "./state.js"

const timedOut = createAction("TimedOut")
type TimedOut = ActionCreatorType<typeof timedOut>

export const waitState = <
  Data,
  ReqAC extends ActionCreator<any, any>,
  ReqA extends ActionCreatorType<ReqAC>,
  RespAC extends ActionCreator<any, any> & GetActionCreatorType<any>,
  RespA extends ActionCreatorType<RespAC>,
>(
  requestAction: ReqAC,
  responseActionCreator: RespAC,
  transition: (data: Data, payload: RespA["payload"]) => HandlerReturn,
  options?: {
    name?: string
    timeout?: number
    onTimeout?: (data: Data) => HandlerReturn
  },
) => {
  const name = options?.name

  return state<Enter | TimedOut, [Data, ReqA["payload"]]>(
    {
      Enter: ([, payload], _, { trigger }) => {
        if (options?.timeout) {
          setTimeout(() => {
            trigger(timedOut())
          }, options.timeout)
        }

        return output(requestAction(payload))
      },

      TimedOut: ([data]) => {
        if (options?.onTimeout) {
          return options?.onTimeout(data)
        }

        return noop()
      },

      [responseActionCreator.type]: (
        [data]: [Data],
        payload: RespA["payload"],
      ) => {
        return transition(data, payload)
      },
    },
    name ? { name } : {},
  )
}
