import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const world = action("World")
export type World = ActionCreatorType<typeof world>
