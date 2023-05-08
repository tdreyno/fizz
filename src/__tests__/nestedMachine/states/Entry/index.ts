import { completedForm, type CompletedForm } from "../../actions"
import Complete from "../Complete"
import { state, stateWrapper } from "../../../../state"
import { Runtime } from "../../../../runtime"
import { Context, History } from "../../../../context"
import {
  type Enter,
  type Exit,
  type ActionCreatorType,
  createAction,
  Action,
} from "../../../../action"
import { initializeNestedRuntime } from "./states"
import type {
  BoundStateFn,
  HandlerReturn,
  State,
  StateTransition,
} from "../../../../core"
import * as NestedActions from "./actions"
import { output } from "../../../../effect"

const Entry = state<
  CompletedForm,
  {
    targetName: string
  }
>(
  {
    CompletedForm() {
      return Complete()
    },
  },
  { name: "Entry" },
)

export const onNestedContextChange = createAction<
  "OnNestedContextChange",
  Context
>("OnNestedContextChange")
export type OnNestedContextChange = ActionCreatorType<
  typeof onNestedContextChange
>

const withNestedMachine = <
  N extends string,
  A extends Action<any, any>,
  D extends { historyItems_?: History["items"] },
  S extends BoundStateFn<N, A, D>,
  AM extends {
    [key: string]: (...args: Array<any>) => Action<any, any>
  },
  RT extends Runtime<any, any, any>,
  R = BoundStateFn<N, A, D>,
>(
  state: S,
  initializer: (shared: D, history?: History["items"]) => RT,
  nestedActions: AM,
): R => {
  // TODO: expand A with forward actions
  // Figure out: OnNestedContextChange
  const handler = ((
    action: A | Enter | Exit | ReturnType<AM[keyof AM]>,
    data: D,
    utils: {
      update: (data: D) => StateTransition<string, A, D>
      trigger: (action: A | Action<any, any>) => void
    },
  ) => {
    switch (action.type) {
      case "Enter":
        // Init and store nested runtime
        const nestedRuntime = initializer(data, data.historyItems_)

        // listen to nested outputs to propogate up
        nestedRuntime.onOutput(action => {
          // utils.trigger(output(action))
        })

        // listen for parent actions to propagate up
        nestedRuntime.onParent((action: A) => {
          utils.trigger(action)
        })

        // track history for serialization on context change
        nestedRuntime.onContextChange(ctx => {
          // utils.trigger(onNestedContextChange(ctx))
        })

        // then run normal enter

        break

      // // Can we generate this?
      // OnNestedContextChange(shared, nestedContext, { update }) {
      //   return update({
      //     ...shared,
      //     nestedHistoryItems: nestedContext.history.toArray(),
      //   })
      // },
      case "Exit":
        // disconnect nested runtime
        // then run normal enter
        // nestedRuntime?.disconnect()
        break

      default:
        if (nestedActions[action.type as string]) {
          // forward to nested machine
          // nestedRuntime?.run(action)
        }
      // either way, try to run on initial state
    }
  }) as State<N, A, D>

  // setup parentActions
  return stateWrapper(state.name, handler) as R
}

const EntryWithNestedMachine = withNestedMachine(
  Entry,
  (shared, history: History["items"]) =>
    initializeNestedRuntime(shared.targetName, history),
  NestedActions,
)

export default Entry
