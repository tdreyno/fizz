import type { Enter } from "../action.js"
import { action, enter } from "../action.js"
import { createMachine } from "../createMachine.js"
import { noop } from "../effect.js"
import { createRuntime } from "../runtime.js"
import {
  createChildRuntimeCommandLineage,
  createRootRuntimeCommandLineage,
} from "../runtime/runtimeCommandLineage.js"
import type { RuntimeDebugEvent } from "../runtime/runtimeContracts.js"
import { state } from "../state.js"

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

describe("runtime command lineage integration", () => {
  const Entry = state<Enter>({ Enter: noop }, { name: "Entry" })
  const Next = state<Enter>({ Enter: noop }, { name: "Next" })
  const Go = action("Go")

  const EntryWithTransition = state<Enter | ReturnType<typeof Go>>(
    {
      Enter: noop,
      Go: () => Next(),
    },
    { name: "EntryWithTransition" },
  )

  test("root command from run() carries origin=run and depth=0 in monitor", async () => {
    const events: RuntimeDebugEvent[] = []
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {
      monitor: e => events.push(e),
    })

    await runtime.run(enter())

    const rootStarted = events.find(
      e => e.type === "command-started" && e.lineage?.depth === 0,
    )

    expect(rootStarted).toBeDefined()

    if (rootStarted?.type === "command-started") {
      expect(rootStarted.lineage?.origin).toBe("run")
      expect(rootStarted.lineage?.depth).toBe(0)
      expect(rootStarted.lineage?.parentId).toBeUndefined()
    }
  })

  test("generated commands carry origin=generated and depth>0 in monitor", async () => {
    const events: RuntimeDebugEvent[] = []
    const machine = createMachine({
      actions: { Go },
      states: { EntryWithTransition, Next },
    })
    const runtime = createRuntime(machine, EntryWithTransition(), {
      monitor: e => events.push(e),
    })

    await runtime.run(enter())
    events.length = 0 // reset; focus on the Go transition
    await runtime.run(Go())

    const completed = events.filter(e => e.type === "command-completed")
    const generated = completed.flatMap(e =>
      e.type === "command-completed" ? e.generatedCommands : [],
    )

    // There should be commands that were generated (child commands)
    expect(generated.length).toBeGreaterThan(0)

    // Child command-started events should have depth > 0
    const childStarted = events.filter(
      e => e.type === "command-started" && e.lineage && e.lineage.depth > 0,
    )

    expect(childStarted.length).toBeGreaterThan(0)

    for (const e of childStarted) {
      if (e.type === "command-started" && e.lineage) {
        expect(e.lineage.origin).toBe("generated")
        expect(e.lineage.depth).toBeGreaterThan(0)
        expect(e.lineage.parentId).toBeDefined()
        expect(e.lineage.rootId).toBeDefined()
      }
    }
  })

  test("child lineage rootId matches the root command id", async () => {
    const events: RuntimeDebugEvent[] = []
    const machine = createMachine({
      actions: { Go },
      states: { EntryWithTransition, Next },
    })
    const runtime = createRuntime(machine, EntryWithTransition(), {
      monitor: e => events.push(e),
    })

    await runtime.run(enter())
    events.length = 0 // reset; focus on the Go transition
    await runtime.run(Go())

    const rootStarted = events.find(
      e => e.type === "command-started" && e.lineage?.depth === 0,
    )
    const childStarted = events.find(
      e => e.type === "command-started" && e.lineage && e.lineage.depth > 0,
    )

    if (
      rootStarted?.type === "command-started" &&
      childStarted?.type === "command-started"
    ) {
      expect(childStarted.lineage?.rootId).toBe(rootStarted.lineage?.rootId)
    }
  })
})
