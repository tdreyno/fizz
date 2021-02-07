import { Action } from "../../../../../action"

export interface FinishedLoading extends Action<"FinishedLoading"> {
  result: string
}

export function finishedLoading(result: string): FinishedLoading {
  return {
    type: "FinishedLoading",
    result,
  }
}
