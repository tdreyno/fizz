import { Action } from "../../../../../action"

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StartLoading extends Action<"StartLoading"> {}

export function startLoading(): StartLoading {
  return {
    type: "StartLoading",
  }
}
