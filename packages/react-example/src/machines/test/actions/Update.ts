import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const update = action("Update")
export type Update = ActionCreatorType<typeof update>
