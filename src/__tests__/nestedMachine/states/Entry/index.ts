import { completedForm, type CompletedForm } from "../../actions"
import { setName, type SetName } from "./actions"
import Complete from "../Complete"
import { state } from "../../../../state"
import { Runtime } from "../../../../runtime"
import { Context, History } from "../../../../context"
import {
  type Enter,
  type Exit,
  type ActionCreatorType,
  createAction,
} from "../../../../action"
import { initializeNestedRuntime, initializeNestedRuntime2 } from "./states"
import type { BoundStateFn } from "../../../../core"
import * as NestedActions from "./actions"

export const onNestedContextChange = createAction<
  "OnNestedContextChange",
  Context
>("OnNestedContextChange")
export type OnNestedContextChange = ActionCreatorType<
  typeof onNestedContextChange
>

type NestedRuntime = Runtime<any, any, any>

const Entry = state<
  Enter | Exit | CompletedForm | SetName | OnNestedContextChange,
  {
    targetName: string
    nestedRuntime?: NestedRuntime
    nestedHistoryItems?: History["items"]
  }
>(
  {
    Enter(shared, _, { update, trigger }) {
      const nestedRuntime = initializeNestedRuntime(
        shared.targetName,
        trigger,
        shared.nestedHistoryItems,
      )

      return update({ ...shared, nestedRuntime })
    },

    // Can we generate this?
    OnNestedContextChange(shared, nestedContext, { update }) {
      return update({
        ...shared,
        nestedHistoryItems: nestedContext.history.toArray(),
      })
    },

    CompletedForm() {
      return Complete()
    },

    // Forward down to nested machine.
    // Can we generate these?
    SetName({ nestedRuntime }, payload) {
      void nestedRuntime?.run(setName(payload))
    },

    // Can we generate this?
    Exit({ nestedRuntime }) {
      nestedRuntime?.disconnect()
    },
  },
  { name: "Entry" },
)

const withNestedMachine = <
  S extends BoundStateFn<any, any, any>,
  AM extends {
    [key: string]: (...args: Array<any>) => Action<any, any>
  },
  D = S extends BoundStateFn<any, any, infer D> ? D : never,
  R = BoundStateFn<any, any, any>,
>(
  state: S,
  initializer: (shared: D, history: History["items"]) => Runtime<any, any, any>,
  nestedActions: AM,
): R => {
  // run initializer on Enter
  const nestedRuntime = initializer(
    state.shared,
    state.context.history.toArray(),
  )

  //listen  to nested outputs to propogate up
  nestedRuntime.onOutput(action => {
    trigger(output(action))
  })

  // listen for parent actions to propagate up
  nestedRuntime.onParent(action => {
    // trigger(action)
  })

  // track history for serialization on context change
  nestedRuntime.onContextChange(ctx => {
    // trigger(onNestedContextChange(ctx))
  })

  // TODO:
  // forward actions to nested machine

  // setup parentActions
  return null as any as R
}

const EntryWithNestedMachine = withNestedMachine(
  Entry,
  (shared, history: History["items"]) =>
    initializeNestedRuntime2(shared.targetName, history),
  NestedActions,
)

export default Entry
