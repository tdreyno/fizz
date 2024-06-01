import { type ActionCreatorType, createAction } from "../../action.js"

export const update = createAction("Update")
export type Update = ActionCreatorType<typeof update>
