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
 * Optional per-branch configuration. Currently only carries an explicit
 * `label` used for introspection/tooling; it is always optional.
 */
export interface RouteBranchOptions {
  label?: string
}

/**
 * Introspection metadata for a single routing branch.
 *
 * `predicate` is omitted for the `otherwise` branch. `label` is always present
 * (resolved from an explicit label, the target's function name, or a
 * positional fallback). `otherwise` flags the unconditional default branch.
 */
export interface RouteBranch<Data = unknown, Payload = unknown> {
  predicate?: (data: Data, payload: Payload) => boolean
  label: string
  otherwise: boolean
}

/**
 * Introspection metadata for a route handler, in branch declaration order.
 */
export interface RouteMetadata<Data = unknown, Payload = unknown> {
  branches: ReadonlyArray<RouteBranch<Data, Payload>>
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

const toPublicBranch = <Data, Payload>({
  predicate,
  label,
  otherwise,
}: InternalBranch<Data, Payload>): RouteBranch<Data, Payload> => ({
  ...(predicate === undefined ? {} : { predicate }),
  label,
  otherwise,
})

const createRouteBuilder = <Data, Payload>(
  branches: ReadonlyArray<InternalBranch<Data, Payload>>,
): RouteBuilder<Data, Payload> => {
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

    return undefined
  }

  const addBranch = (branch: InternalBranch<Data, Payload>) =>
    createRouteBuilder<Data, Payload>([...branches, branch])

  const builder = handler as unknown as RouteBuilderMutable<Data, Payload>

  builder.when = (predicate, target, options) =>
    addBranch({
      predicate,
      target,
      otherwise: false,
      label: resolveLabel(options?.label, target, false, branches.length + 1),
    })

  builder.otherwise = (target, options) =>
    addBranch({
      target,
      otherwise: true,
      label: resolveLabel(options?.label, target, true, branches.length + 1),
    })

  builder[routeMetadataSymbol] = {
    branches: branches.map(branch => toPublicBranch(branch)),
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
 */
export const route = <Data = undefined, Payload = undefined>(): RouteBuilder<
  Data,
  Payload
> => createRouteBuilder<Data, Payload>([])

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
