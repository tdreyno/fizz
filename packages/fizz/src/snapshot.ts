import { enter } from "./action.js"
import type { Context } from "./context.js"
import type { MachineDefinition } from "./createMachine.js"
import { SnapshotRestoreError } from "./errors.js"
import type { CreateRuntimeOptions, Runtime } from "./runtime.js"
import { createRuntimeFromHistory } from "./runtime.js"
import type { BoundStateFn, StateTransition } from "./state.js"
import { NESTED, PARALLEL_RUNTIMES } from "./state.js"

export { SnapshotRestoreError } from "./errors.js"

/** A single serialized history entry. Newest entries come first. */
export interface StateSnapshot {
  name: string
  data: unknown
  mode: "append" | "update"
  nested?: RuntimeSnapshot
  parallel?: Record<string, RuntimeSnapshot>
}

/** Serializable capture of a runtime's state history. */
export interface RuntimeSnapshot {
  version: 1
  machineName?: string
  history: StateSnapshot[]
}

export interface GetSnapshotOptions {
  /** Cap the number of captured history entries (newest-first). */
  maxHistory?: number

  /** Optional label stored on the snapshot for consumers. */
  machineName?: string
}

const SNAPSHOT_VERSION = 1

/** Marker planted on restored state data so nested/parallel states can
 * rebuild their child runtimes from the snapshot during enter. */
export const RESTORE_SNAPSHOT = Symbol("Restore snapshot")

/** Marker planted on restored parallel state data holding per-branch
 * snapshots keyed by branch name. */
export const RESTORE_PARALLEL_SNAPSHOTS = Symbol("Restore parallel snapshots")

type RestoreCarrier = {
  [RESTORE_SNAPSHOT]?: RuntimeSnapshot
  [RESTORE_PARALLEL_SNAPSHOTS]?: Record<string, RuntimeSnapshot>
}

type RuntimeLike = { context: Context }

const isRuntimeLike = (value: unknown): value is RuntimeLike =>
  typeof value === "object" &&
  value !== null &&
  "context" in value &&
  typeof (value as { context?: { history?: unknown } }).context?.history ===
    "object"

const nestedRuntimeOf = (data: unknown): RuntimeLike | undefined => {
  if (typeof data !== "object" || data === null || !(NESTED in data)) {
    return undefined
  }

  const child = (data as { [NESTED]?: unknown })[NESTED]

  return isRuntimeLike(child) ? child : undefined
}

const parallelRuntimesOf = (
  data: unknown,
): Record<string, RuntimeLike> | undefined => {
  if (
    typeof data !== "object" ||
    data === null ||
    !(PARALLEL_RUNTIMES in data)
  ) {
    return undefined
  }

  const runtimes = (data as { [PARALLEL_RUNTIMES]?: unknown })[
    PARALLEL_RUNTIMES
  ]

  if (typeof runtimes !== "object" || runtimes === null) {
    return undefined
  }

  const entries = Object.entries(runtimes).filter(
    (pair): pair is [string, RuntimeLike] => isRuntimeLike(pair[1]),
  )

  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

const stripSymbolKeys = (data: unknown): unknown => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return data
  }

  return Object.fromEntries(Object.entries(data as Record<string, unknown>))
}

const toStateSnapshot = (
  transition: StateTransition<string, any, unknown>,
): StateSnapshot => {
  const nested = nestedRuntimeOf(transition.data)
  const parallel = parallelRuntimesOf(transition.data)

  return {
    data: stripSymbolKeys(transition.data),
    mode: transition.mode,
    name: transition.name,
    ...(nested === undefined
      ? {}
      : { nested: snapshotFromContext(nested.context) }),
    ...(parallel === undefined
      ? {}
      : {
          parallel: Object.fromEntries(
            Object.entries(parallel).map(([key, branch]) => [
              key,
              snapshotFromContext(branch.context),
            ]),
          ),
        }),
  }
}

const snapshotFromContext = (
  context: Context,
  options?: GetSnapshotOptions,
): RuntimeSnapshot => {
  const entries = context.history.toArray()
  const capped =
    options?.maxHistory === undefined
      ? entries
      : entries.slice(0, options.maxHistory)

  return {
    ...(options?.machineName === undefined
      ? {}
      : { machineName: options.machineName }),
    history: capped.map(toStateSnapshot),
    version: SNAPSHOT_VERSION,
  }
}

/**
 * Capture a serializable snapshot of a runtime's current state and history.
 *
 * Live handles (nested runtimes, parallel runtimes, resources) are not
 * serialized. Newest history entry is first.
 */
export const getSnapshot = (
  runtime: Runtime<any, any>,
  options?: GetSnapshotOptions,
): RuntimeSnapshot => snapshotFromContext(runtime.context, options)

export interface RestoreRuntimeOptions extends CreateRuntimeOptions {
  /** Re-run the restored state's enter lifecycle. Defaults to true. */
  runLifecycle?: boolean
}

type AnyBoundStateFn = BoundStateFn<string, any, any>
type StatesRecord = Record<string, AnyBoundStateFn>
type AnyMachine = MachineDefinition<
  StatesRecord,
  any,
  any,
  unknown,
  any,
  Record<string, unknown>
>

const findStateFn = (
  states: StatesRecord,
  name: string,
): AnyBoundStateFn | undefined =>
  states[name] ?? Object.values(states).find(stateFn => stateFn.name === name)

const rebuildTransition = (
  states: StatesRecord,
  entry: StateSnapshot,
): StateTransition<string, any, unknown> => {
  const stateFn = findStateFn(states, entry.name)

  if (!stateFn) {
    throw new SnapshotRestoreError(
      `Snapshot references unknown state "${entry.name}". ` +
        "Ensure the machine's states include a state with this name.",
    )
  }

  const transition =
    entry.data === undefined
      ? (stateFn as () => StateTransition<string, any, unknown>)()
      : stateFn(entry.data)

  transition.mode = entry.mode

  if (entry.nested !== undefined) {
    if (typeof transition.data !== "object" || transition.data === null) {
      throw new SnapshotRestoreError(
        `State "${entry.name}" has a nested snapshot but non-object data. ` +
          "Nested restore requires object state data.",
      )
    }

    ;(transition.data as RestoreCarrier)[RESTORE_SNAPSHOT] = entry.nested
  }

  if (entry.parallel !== undefined) {
    if (typeof transition.data !== "object" || transition.data === null) {
      throw new SnapshotRestoreError(
        `State "${entry.name}" has parallel snapshots but non-object data. ` +
          "Parallel restore requires object state data.",
      )
    }

    ;(transition.data as RestoreCarrier)[RESTORE_PARALLEL_SNAPSHOTS] =
      entry.parallel
  }

  return transition
}

/**
 * Rebuild the state transitions for a snapshot's history (newest-first)
 * using a name-to-state lookup. Used by nested and parallel restore.
 */
export const rebuildSnapshotHistory = (
  states: StatesRecord,
  snapshot: RuntimeSnapshot,
): Array<StateTransition<string, any, unknown>> => {
  assertRestorableSnapshot(snapshot)

  return snapshot.history.map(entry => rebuildTransition(states, entry))
}

/**
 * Read and remove a restore marker planted on state data by
 * {@link restoreRuntime}. Returns the child snapshot when present.
 */
export const consumeRestoreSnapshot = (
  data: unknown,
): RuntimeSnapshot | undefined => {
  if (
    typeof data !== "object" ||
    data === null ||
    !(RESTORE_SNAPSHOT in data)
  ) {
    return undefined
  }

  const carrier = data as RestoreCarrier
  const snapshot = carrier[RESTORE_SNAPSHOT]

  delete carrier[RESTORE_SNAPSHOT]

  return snapshot
}

/**
 * Read and remove the per-branch parallel restore markers planted on state
 * data by {@link restoreRuntime}. Returns branch snapshots keyed by name.
 */
export const consumeRestoreParallelSnapshots = (
  data: unknown,
): Record<string, RuntimeSnapshot> | undefined => {
  if (
    typeof data !== "object" ||
    data === null ||
    !(RESTORE_PARALLEL_SNAPSHOTS in data)
  ) {
    return undefined
  }

  const carrier = data as RestoreCarrier
  const snapshots = carrier[RESTORE_PARALLEL_SNAPSHOTS]

  delete carrier[RESTORE_PARALLEL_SNAPSHOTS]

  return snapshots
}

const assertRestorableSnapshot = (snapshot: RuntimeSnapshot): void => {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new SnapshotRestoreError(
      `Unsupported snapshot version ${String(snapshot.version)}. ` +
        `Expected ${String(SNAPSHOT_VERSION)}.`,
    )
  }

  if (snapshot.history.length === 0) {
    throw new SnapshotRestoreError(
      "Snapshot history is empty. At least one state is required.",
    )
  }
}

/**
 * Rebuild a runtime from a snapshot captured with {@link getSnapshot}.
 *
 * History is restored newest-first so `goBack()` works after restore. By
 * default the restored state's enter lifecycle runs so timers, async work,
 * and listeners re-establish; pass `runLifecycle: false` to skip it.
 */
export const restoreRuntime = async (
  machine: AnyMachine,
  snapshot: RuntimeSnapshot,
  options?: RestoreRuntimeOptions,
): Promise<Runtime<any, any>> => {
  assertRestorableSnapshot(snapshot)

  const { runLifecycle = true, ...runtimeOptions } = options ?? {}

  const history = snapshot.history.map(entry =>
    rebuildTransition(machine.states, entry),
  )

  const runtime = createRuntimeFromHistory(
    machine,
    history as Array<ReturnType<AnyBoundStateFn>>,
    runtimeOptions,
  )

  if (runLifecycle) {
    await runtime.run(enter())
  }

  return runtime
}

type JsonReplacer = (key: string, value: unknown) => unknown
type JsonReviver = (key: string, value: unknown) => unknown

export interface SerializeSnapshotOptions {
  /** Custom JSON replacer for non-JSON-safe state data (Dates, Maps, ...). */
  replacer?: JsonReplacer

  /** Pretty-print indentation passed to JSON.stringify. */
  space?: number | string
}

export interface ParseSnapshotOptions {
  /** Custom JSON reviver matching the replacer used to serialize. */
  reviver?: JsonReviver
}

/** Serialize a snapshot to a JSON string. */
export const serializeSnapshot = (
  snapshot: RuntimeSnapshot,
  options?: SerializeSnapshotOptions,
): string =>
  JSON.stringify(
    snapshot,
    options?.replacer as Parameters<typeof JSON.stringify>[1],
    options?.space,
  )

const isStateSnapshotShape = (entry: unknown): entry is StateSnapshot =>
  typeof entry === "object" &&
  entry !== null &&
  typeof (entry as { name?: unknown }).name === "string" &&
  ((entry as { mode?: unknown }).mode === "append" ||
    (entry as { mode?: unknown }).mode === "update")

const assertParsedSnapshot = (parsed: unknown): RuntimeSnapshot => {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SnapshotRestoreError("Parsed JSON is not a snapshot object.")
  }

  const candidate = parsed as Partial<RuntimeSnapshot>

  if (candidate.version !== SNAPSHOT_VERSION) {
    throw new SnapshotRestoreError(
      `Unsupported snapshot version ${String(candidate.version)}. ` +
        `Expected ${String(SNAPSHOT_VERSION)}.`,
    )
  }

  if (!Array.isArray(candidate.history)) {
    throw new SnapshotRestoreError("Snapshot history must be an array.")
  }

  const invalid = candidate.history.find(entry => !isStateSnapshotShape(entry))

  if (invalid !== undefined) {
    throw new SnapshotRestoreError(
      "Snapshot history entries require a string name and an " +
        '"append" or "update" mode.',
    )
  }

  return candidate as RuntimeSnapshot
}

/** Parse and validate a JSON string produced by {@link serializeSnapshot}. */
export const parseSnapshot = (
  json: string,
  options?: ParseSnapshotOptions,
): RuntimeSnapshot =>
  assertParsedSnapshot(
    JSON.parse(json, options?.reviver as Parameters<typeof JSON.parse>[1]),
  )
