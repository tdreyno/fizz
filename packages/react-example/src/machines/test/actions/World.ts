import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const world = createAction("World")
export type World = ActionCreatorType<typeof world>
