export type RuntimeCommandLineage = {
  depth: number
  id: string
  origin: "generated" | "run"
  parentId?: string
  rootId: string
}

export const createRootRuntimeCommandLineage = (
  id: string,
): RuntimeCommandLineage => ({
  depth: 0,
  id,
  origin: "run",
  rootId: id,
})

export const createChildRuntimeCommandLineage = (options: {
  id: string
  parent: RuntimeCommandLineage
}): RuntimeCommandLineage => ({
  depth: options.parent.depth + 1,
  id: options.id,
  origin: "generated",
  parentId: options.parent.id,
  rootId: options.parent.rootId,
})
