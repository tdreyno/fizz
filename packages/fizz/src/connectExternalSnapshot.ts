import type { Runtime } from "./runtime.js"
import type { RuntimeAction } from "./runtime/runtimeContracts.js"

export interface ConnectExternalSnapshotOptions<StoreState, Snapshot> {
  runtime: Runtime<any, any>
  subscribe: (onChange: () => void) => () => void
  read: () => StoreState
  select: (state: StoreState) => Snapshot
  toAction: (snapshot: Snapshot) => RuntimeAction
  equality?: (a: Snapshot, b: Snapshot) => boolean
  loopGuard?: { key: (snapshot: Snapshot) => string }
  emitInitial?: boolean
}

export function connectExternalSnapshot<StoreState, Snapshot>(
  options: ConnectExternalSnapshotOptions<StoreState, Snapshot>,
): () => void {
  const {
    runtime,
    subscribe,
    read,
    select,
    toAction,
    equality = Object.is,
    loopGuard,
    emitInitial = false,
  } = options

  let lastSnapshot: Snapshot | undefined
  let lastDispatchedKey: string | undefined
  let initialized = false

  const handleChange = (): void => {
    const snapshot = select(read())

    if (initialized && equality(lastSnapshot as Snapshot, snapshot)) {
      return
    }

    if (loopGuard !== undefined) {
      const key = loopGuard.key(snapshot)

      if (key === lastDispatchedKey) {
        lastSnapshot = snapshot
        initialized = true
        return
      }

      lastDispatchedKey = key
    }

    lastSnapshot = snapshot
    initialized = true

    void runtime.run(toAction(snapshot))
  }

  const unsubscribeStore = subscribe(handleChange)

  const removeDisconnectHook = runtime.onDisconnect(unsubscribeStore)

  if (emitInitial) {
    handleChange()
  } else {
    const initialSnapshot = select(read())
    lastSnapshot = initialSnapshot
    initialized = true

    if (loopGuard !== undefined) {
      lastDispatchedKey = loopGuard.key(initialSnapshot)
    }
  }

  return () => {
    unsubscribeStore()
    removeDisconnectHook()
  }
}
