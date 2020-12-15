/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Action<T extends string> {
  type: T
}

export type ActionCreator<A extends Action<any>, Args extends any[]> = (
  ...args: Args
) => A

export function isAction<T extends string>(
  a: Action<T> | unknown,
): a is Action<T> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return !!a && (a as any).type !== undefined
}

export function isActions(actions: unknown): actions is Array<Action<any>> {
  return Array.isArray(actions) && actions.every(isAction)
}

export type Enter = Action<"Enter">

export function enter(): Enter {
  return {
    type: "Enter",
  }
}

export type Exit = Action<"Exit">

export function exit(): Exit {
  return {
    type: "Exit",
  }
}

export interface OnFrame extends Action<"OnFrame"> {
  ts: number
}

export function onFrame(ts: number): OnFrame {
  return {
    type: "OnFrame",
    ts,
  }
}

// Helper for making simple actions.
export function typedAction<T extends string>(type: T): () => Action<T> {
  return () => ({
    type,
  })
}
