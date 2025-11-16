import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const update = createAction("Update")
export type Update = ActionCreatorType<typeof update>
