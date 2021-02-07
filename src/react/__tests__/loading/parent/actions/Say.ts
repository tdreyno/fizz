import { Action } from "../../../../../action"

export interface Say extends Action<"Say"> {
  message: string
}

export function say(message: string): Say {
  return {
    type: "Say",
    message,
  }
}
