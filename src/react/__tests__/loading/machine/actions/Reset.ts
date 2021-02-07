import { Action } from "../../../../../action"

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Reset extends Action<"Reset"> {}

export function reset(): Reset {
  return {
    type: "Reset",
  }
}
