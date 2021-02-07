/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Action<T extends string> {
  type: T
}

export type ActionCreator<A extends Action<any>, Args extends any[]> = (
  ...args: Args
) => A

export const isAction = <T extends string>(a: unknown): a is Action<T> =>
  /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
  !!a && (a as any).type !== undefined

export const isActions = (actions: unknown): actions is Array<Action<any>> =>
  Array.isArray(actions) && actions.every(isAction)

export type Enter = Action<"Enter">

export const enter = (): Enter => ({
  type: "Enter",
})

export type Exit = Action<"Exit">

export const exit = (): Exit => ({
  type: "Exit",
})

export interface OnFrame extends Action<"OnFrame"> {
  ts: number
}

export const onFrame = (ts: number): OnFrame => ({
  type: "OnFrame",
  ts,
})

// Helper for making simple actions.
export const typedAction = <T extends string>(
  type: T,
): (() => Action<T>) => () => ({
  type,
})
