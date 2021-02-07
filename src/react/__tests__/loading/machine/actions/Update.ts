import { Action } from "../../../../../action"

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Update extends Action<"Update"> {}

export function update(): Update {
  return {
    type: "Update",
  }
}
