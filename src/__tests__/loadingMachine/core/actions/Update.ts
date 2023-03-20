import { type ActionCreatorType, createAction } from "../../../../action"

export const update = createAction("Update")
export type Update = ActionCreatorType<typeof update>
