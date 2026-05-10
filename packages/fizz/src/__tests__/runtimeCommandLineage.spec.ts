import {
  createChildRuntimeCommandLineage,
  createRootRuntimeCommandLineage,
} from "../runtime/runtimeCommandLineage.js"

describe("runtimeCommandLineage", () => {
  test("creates a deterministic root lineage", () => {
    const root = createRootRuntimeCommandLineage("cmd-1")

    expect(root).toEqual({
      depth: 0,
      id: "cmd-1",
      origin: "run",
      rootId: "cmd-1",
    })
  })

  test("creates deterministic child lineage rooted at ancestor", () => {
    const root = createRootRuntimeCommandLineage("cmd-1")

    const child = createChildRuntimeCommandLineage({
      id: "cmd-2",
      parent: root,
    })

    const grandChild = createChildRuntimeCommandLineage({
      id: "cmd-3",
      parent: child,
    })

    expect(child).toEqual({
      depth: 1,
      id: "cmd-2",
      origin: "generated",
      parentId: "cmd-1",
      rootId: "cmd-1",
    })

    expect(grandChild).toEqual({
      depth: 2,
      id: "cmd-3",
      origin: "generated",
      parentId: "cmd-2",
      rootId: "cmd-1",
    })
  })
})
