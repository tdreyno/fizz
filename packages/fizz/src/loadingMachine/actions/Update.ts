import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const update = action("Update")
export type Update = ActionCreatorType<typeof update>
