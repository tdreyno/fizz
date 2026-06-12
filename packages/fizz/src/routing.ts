import type { HandlerReturn } from "./state.js"

/**
 * A branch target. Receives the same arguments a normal state handler would
 * (`data`, `payload`, `utils`) and returns anything a handler may return: a
 * transition, an effect, an action, an array combination, a bare data value
 * (implicit in-place update), or a promise of any of those.
 *
 * A bare {@link import("./state.js").BoundStateFn} satisfies this type
 * structurally — it is called with the current `data` and ignores the extra
 * arguments — so `route().otherwise(SomeState)` works without ceremony.
 */
export type RouteTarget<TData, Data, Payload> = (
  data: TData,
  payload: Payload,
  utils: any,
) => HandlerReturn<Data>

/**
 * Optional per-branch configuration.
 *
 * `label` is used for introspection/tooling. `id` is a stable branch identifier
 * for resilient tests and route visualizers; when omitted it defaults to the
 * resolved `label`. Both are always optional.
 */
export interface RouteBranchOptions {
  id?: string
  label?: string
}

/**
 * Introspection metadata for a single routing branch.
 *
 * `predicate` is omitted for the `otherwise` branch. `id` and `label` are always
 * present (resolved from explicit options, the target's function name, or a
 * positional fallback). `index` is the 0-based declaration order. `otherwise`
 * flags the unconditional default branch.
 */
export interface RouteBranch<Data = unknown, Payload = unknown> {
  predicate?: (data: Data, payload: Payload) => boolean
  id: string
  label: string
  index: number
  otherwise: boolean
}

/**
 * Introspection metadata for a route handler, in branch declaration order.
 */
export interface RouteMetadata<Data = unknown, Payload = unknown> {
  branches: ReadonlyArray<RouteBranch<Data, Payload>>
}

/**
 * Context passed to a custom `onUnmatched` handler (and carried by
 * {@link RouteUnmatchedError}) when a strict route finds no matching branch.
 */
export interface RouteUnmatchedContext<Data = unknown, Payload = unknown> {
  data: Data
  payload: Payload
  branches: ReadonlyArray<RouteBranch<Data, Payload>>
}

/**
 * Behavior to run when a strict route finds no matching branch and has no
 * `otherwise(...)`. `"throw"` raises a {@link RouteUnmatchedError}, `"warn"`
 * emits a `console.warn`, and a function receives the {@link RouteUnmatchedContext}.
 */
export type RouteUnmatchedBehavior<Data = unknown, Payload = unknown> =
  | "throw"
  | "warn"
  | ((context: RouteUnmatchedContext<Data, Payload>) => void)

/**
 * Optional configuration for {@link route}.
 *
 * By default an unmatched route is a silent no-op (the machine stays put).
 * Set `strict: true` (which defaults to `"throw"`) or provide an explicit
 * `onUnmatched` to opt into unmatched diagnostics.
 */
export interface RouteOptions<Data = unknown, Payload = unknown> {
  strict?: boolean
  onUnmatched?: RouteUnmatchedBehavior<Data, Payload>
}

/**
 * Error thrown when a strict route finds no matching branch and has no
 * `otherwise(...)`. Carries the {@link RouteUnmatchedContext} for debugging.
 */
export class RouteUnmatchedError extends Error {
  readonly context: RouteUnmatchedContext

  constructor(context: RouteUnmatchedContext) {
    super(
      `route() found no matching branch and no otherwise() for payload ${JSON.stringify(
        context.payload,
      )} with data ${JSON.stringify(context.data)}`,
    )
    this.name = "RouteUnmatchedError"
    this.context = context
  }
}

/**
 * A declarative, guarded-transition handler builder.
 *
 * The builder value is itself a valid state handler
 * `(data, payload, utils) => HandlerReturn<Data>`, so it can be dropped into an
 * `Enter` slot (a transient/eventless transition) or any action handler slot (a
 * guarded transition on an event). Branches are evaluated top-to-bottom and the
 * first matching predicate wins; later predicates are not evaluated. When no
 * branch matches the handler returns `undefined`, which keeps the machine in
 * its current state.
 *
 * Each chained call returns a new builder; builders are immutable.
 */
export interface RouteBuilder<Data, Payload = undefined> {
  (data: Data, payload: Payload, utils?: unknown): HandlerReturn<Data>

  when<Narrowed extends Data>(
    predicate: (data: Data, payload: Payload) => data is Narrowed,
    target: RouteTarget<Narrowed, Data, Payload>,
    options?: RouteBranchOptions,
  ): RouteBuilder<Data, Payload>
  when(
    predicate: (data: Data, payload: Payload) => boolean,
    target: RouteTarget<Data, Data, Payload>,
    options?: RouteBranchOptions,
  ): RouteBuilder<Data, Payload>

  otherwise(
    target: RouteTarget<Data, Data, Payload>,
    options?: RouteBranchOptions,
  ): RouteBuilder<Data, Payload>
}

const routeMetadataSymbol = Symbol("fizz route metadata")

type LooseTarget<Data, Payload> = (
  data: Data,
  payload: Payload,
  utils: any,
) => HandlerReturn<Data>

interface InternalBranch<Data, Payload> {
  predicate?: (data: Data, payload: Payload) => boolean
  target: LooseTarget<Data, Payload>
  id: string
  label: string
  otherwise: boolean
}

interface RouteBuilderMutable<Data, Payload> {
  (data: Data, payload: Payload, utils?: unknown): HandlerReturn<Data>
  when: (
    predicate: (data: Data, payload: Payload) => boolean,
    target: LooseTarget<Data, Payload>,
    options?: RouteBranchOptions,
  ) => RouteBuilder<Data, Payload>
  otherwise: (
    target: LooseTarget<Data, Payload>,
    options?: RouteBranchOptions,
  ) => RouteBuilder<Data, Payload>
  [routeMetadataSymbol]: RouteMetadata<Data, Payload>
}

const resolveLabel = (
  explicit: string | undefined,
  target: { name: string },
  otherwise: boolean,
  position: number,
): string => {
  if (explicit !== undefined) {
    return explicit
  }

  if (target.name !== "") {
    return target.name
  }

  return otherwise ? "otherwise" : `branch ${position}`
}

const resolveId = (explicit: string | undefined, label: string): string =>
  explicit ?? label

const toPublicBranch = <Data, Payload>(
  { predicate, id, label, otherwise }: InternalBranch<Data, Payload>,
  index: number,
): RouteBranch<Data, Payload> => ({
  ...(predicate === undefined ? {} : { predicate }),
  id,
  label,
  index,
  otherwise,
})

const resolveUnmatchedBehavior = <Data, Payload>(
  options: RouteOptions<Data, Payload> | undefined,
): RouteUnmatchedBehavior<Data, Payload> | undefined => {
  if (options?.onUnmatched !== undefined) {
    return options.onUnmatched
  }

  if (options?.strict === true) {
    return "throw"
  }

  return undefined
}

const createRouteBuilder = <Data, Payload>(
  branches: ReadonlyArray<InternalBranch<Data, Payload>>,
  options?: RouteOptions<Data, Payload>,
): RouteBuilder<Data, Payload> => {
  const publicBranches = branches.map((branch, index) =>
    toPublicBranch(branch, index),
  )
  const unmatchedBehavior = resolveUnmatchedBehavior(options)

  const handler = (
    data: Data,
    payload: Payload,
    utils?: unknown,
  ): HandlerReturn<Data> => {
    for (const branch of branches) {
      if (branch.otherwise || (branch.predicate?.(data, payload) ?? false)) {
        return branch.target(data, payload, utils)
      }
    }

    if (unmatchedBehavior !== undefined) {
      const context: RouteUnmatchedContext<Data, Payload> = {
        branches: publicBranches,
        data,
        payload,
      }

      if (unmatchedBehavior === "throw") {
        throw new RouteUnmatchedError(
          context as RouteUnmatchedContext<unknown, unknown>,
        )
      }

      if (unmatchedBehavior === "warn") {
        console.warn(
          "route() found no matching branch and no otherwise()",
          context,
        )
      } else {
        unmatchedBehavior(context)
      }
    }

    return undefined
  }

  const addBranch = (branch: InternalBranch<Data, Payload>) =>
    createRouteBuilder<Data, Payload>([...branches, branch], options)

  const builder = handler as unknown as RouteBuilderMutable<Data, Payload>

  builder.when = (predicate, target, branchOptions) => {
    const label = resolveLabel(
      branchOptions?.label,
      target,
      false,
      branches.length + 1,
    )

    return addBranch({
      predicate,
      target,
      otherwise: false,
      id: resolveId(branchOptions?.id, label),
      label,
    })
  }

  builder.otherwise = (target, branchOptions) => {
    const label = resolveLabel(
      branchOptions?.label,
      target,
      true,
      branches.length + 1,
    )

    return addBranch({
      target,
      otherwise: true,
      id: resolveId(branchOptions?.id, label),
      label,
    })
  }

  builder[routeMetadataSymbol] = {
    branches: publicBranches,
  }

  return builder as RouteBuilder<Data, Payload>
}

/**
 * Create a declarative, guarded-transition handler.
 *
 * @example
 * ```ts
 * state({
 *   Enter: route<CartData>()
 *     .when(d => d.items === 0, EmptyCart)
 *     .when(d => d.coupon != null, d => [log("coupon"), Discounted(d)])
 *     .otherwise(ReadyToPay),
 * })
 * ```
 *
 * `Data` and `Payload` are supplied explicitly; predicates receive
 * `(data, payload)` and must be synchronous and pure.
 *
 * By default an unmatched route is a silent no-op. Pass `{ strict: true }`
 * (which defaults to throwing a {@link RouteUnmatchedError}) or an explicit
 * `{ onUnmatched }` to opt into unmatched diagnostics.
 */
export const route = <Data = undefined, Payload = undefined>(
  options?: RouteOptions<Data, Payload>,
): RouteBuilder<Data, Payload> => createRouteBuilder<Data, Payload>([], options)

/**
 * Read the introspection metadata from a route handler produced by
 * {@link route}. Returns `undefined` for any value that is not a route handler.
 */
export const getRouteMetadata = <Data = unknown, Payload = unknown>(
  handler: unknown,
): RouteMetadata<Data, Payload> | undefined => {
  if (typeof handler !== "function" && typeof handler !== "object") {
    return undefined
  }

  if (handler === null) {
    return undefined
  }

  return (
    handler as {
      [routeMetadataSymbol]?: RouteMetadata<Data, Payload>
    }
  )[routeMetadataSymbol]
}
