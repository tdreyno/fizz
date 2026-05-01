import { jest } from "@jest/globals"

import type { ActionCreatorType, Enter, Exit } from "../action"
import { action, enter } from "../action"
import type { Context } from "../context"
import { createInitialContext } from "../context"
import { createMachine } from "../createMachine"
import { commandEffect, goBack, log, noop } from "../effect"
import { UnknownStateReturnType } from "../errors"
import { commandHandlersFromClients, createRuntime, Runtime } from "../runtime"
import { selectWhen } from "../selectors"
import { state, switch_ } from "../state"

describe("Runtime", () => {
  test("should transition through multiple states", async () => {
    const A = state<Enter>(
      {
        Enter: () => B(),
      },
      { name: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { name: "B" },
    )

    const context = createInitialContext([A()])

    const runtime = new Runtime(context)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should create a runtime from a machine definition", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>(
      {
        Enter: noop,
        Trigger: () => B(),
      },
      { name: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { name: "B" },
    )

    const machine = createMachine({
      actions: { trigger },
      states: { A, B },
    })

    const runtime = createRuntime(machine, A())

    await runtime.run(trigger())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run and select with a selector from the resulting state", async () => {
    const localChanged = action("LocalChanged").withPayload<{
      value: string
    }>()
    type LocalChanged = ActionCreatorType<typeof localChanged>

    const Editing = state<Enter, { value: string }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter | LocalChanged, { value: string }>(
      {
        Enter: noop,
        LocalChanged: (_, payload) => Editing({ value: payload.value }),
      },
      { name: "Viewing" },
    )

    const machine = createMachine({
      actions: { localChanged },
      selectors: {
        renderInputs: selectWhen(Editing, data => ({
          canSave: data.value.length > 0,
          preview: data.value.trim(),
        })),
      },
      states: { Editing, Viewing },
    })

    const runtime = createRuntime(machine, Viewing({ value: "" }))

    const selected = await runtime.runAndSelect(
      localChanged({ value: " draft text " }),
      machine.selectors.renderInputs,
    )

    expect(selected).toEqual({
      canSave: true,
      preview: "draft text",
    })
  })

  test("should return undefined when selector does not match the resulting state", async () => {
    const localChanged = action("LocalChanged")

    const Editing = state<Enter, { value: string }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const machine = createMachine({
      actions: { localChanged },
      selectors: {
        renderInputs: selectWhen(Editing, data => data.value.trim()),
      },
      states: { Editing, Viewing },
    })

    const runtime = createRuntime(machine, Viewing())

    const selected = await runtime.runAndSelect(
      localChanged(),
      machine.selectors.renderInputs,
    )

    expect(selected).toBeUndefined()
  })

  test("should return false for matcher selectors when the resulting state does not match", async () => {
    const localChanged = action("LocalChanged")

    const Editing = state<Enter, { status: string }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const machine = createMachine({
      actions: { localChanged },
      selectors: {
        isReady: selectWhen(Editing, { status: "ready" }),
      },
      states: { Editing, Viewing },
    })

    const runtime = createRuntime(machine, Viewing())

    const selected = await runtime.runAndSelect(
      localChanged(),
      machine.selectors.isReady,
    )

    expect(selected).toBe(false)
  })

  test("should run the action returned", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>({
      Enter: trigger,
      Trigger: () => B(),
    })

    const B = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run in correct order", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger, { num: number }>({
      Enter: (shared, __, { update }) => {
        return [update({ ...shared, num: shared.num * 5 }), trigger()]
      },

      Trigger: (shared, __, { update }) => {
        return update({ ...shared, num: shared.num - 2 })
      },
    })

    const context = createInitialContext([A({ num: 3 })])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    const s = runtime.currentState()

    if (!s.is(A)) {
      throw new Error("Expected current state A")
    }

    expect(s.data.num).toBe(13)
  })

  test("should run and project from the final state after chained transitions", async () => {
    const next = action("Next")
    type Next = ActionCreatorType<typeof next>

    const C = state<Enter, { count: number }>(
      {
        Enter: noop,
      },
      { name: "C" },
    )

    const B = state<Enter | Next, { count: number }>(
      {
        Enter: noop,
        Next: data => C({ count: data.count + 1 }),
      },
      { name: "B" },
    )

    const A = state<Enter, { count: number }>(
      {
        Enter: data => [B(data), next()],
      },
      { name: "A" },
    )

    const runtime = new Runtime(createInitialContext([A({ count: 2 })]), {
      next,
    })

    const selected = await runtime.runAndSelect<number | undefined>(
      enter(),
      state =>
        switch_<number | undefined>(state)
          .case_(C, data => data.count)
          .run(),
    )

    expect(selected).toBe(3)
  })

  test("should project from the current state after an unhandled action", async () => {
    const trigger = action("Trigger")

    const A = state<Enter, { value: string }>(
      {
        Enter: noop,
      },
      { name: "A" },
    )

    const runtime = new Runtime(createInitialContext([A({ value: "ready" })]), {
      trigger,
    })

    const selected = await runtime.runAndSelect<string | undefined>(
      trigger(),
      state =>
        switch_<string | undefined>(state)
          .case_(A, data => data.value)
          .run(),
    )

    expect(selected).toBe("ready")
  })

  test("should reject when the projection throws", async () => {
    const A = state<Enter>(
      {
        Enter: noop,
      },
      { name: "A" },
    )

    const runtime = new Runtime(createInitialContext([A()]))

    await expect(
      runtime.runAndSelect(enter(), () => {
        throw new Error("selector failed")
      }),
    ).rejects.toThrow("selector failed")
  })

  test("should map command handler results with chainToAction", async () => {
    type Commands = {
      notesEditor: {
        setDocument: {
          payload: { document: string }
          result: { saved: true }
        }
      }
    }

    const applyClicked = action("ApplyClicked").withPayload<{
      document: string
    }>()
    const applySucceeded = action("ApplySucceeded")
    type ApplyClicked = ActionCreatorType<typeof applyClicked>
    type ApplySucceeded = ActionCreatorType<typeof applySucceeded>

    const Editing = state<ApplyClicked | ApplySucceeded, { status: string }>(
      {
        ApplyClicked: (_, payload) =>
          commandEffect<Commands, "notesEditor", "setDocument">(
            "notesEditor",
            "setDocument",
            { document: payload.document },
          ).chainToAction(() => applySucceeded()),
        ApplySucceeded: (data, _, { update }) =>
          update({
            ...data,
            status: "applied",
          }),
      },
      { name: "Editing" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { applyClicked, applySucceeded },
        states: { Editing },
      }),
      Editing({ status: "idle" }),
      {
        commandHandlers: {
          notesEditor: {
            setDocument: () => ({ saved: true as const }),
          },
        },
      },
    )

    await runtime.run(applyClicked({ document: "Hello" }))

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.status).toBe("applied")
  })

  test("should map command handler errors with chainToAction reject", async () => {
    type Commands = {
      notesEditor: {
        setDocument: {
          payload: { document: string }
          result: { saved: true }
        }
      }
    }

    const applyClicked = action("ApplyClicked").withPayload<{
      document: string
    }>()
    const applyFailed = action("ApplyFailed").withPayload<{ message: string }>()
    type ApplyClicked = ActionCreatorType<typeof applyClicked>
    type ApplyFailed = ActionCreatorType<typeof applyFailed>

    const Editing = state<ApplyClicked | ApplyFailed, { error?: string }>(
      {
        ApplyClicked: (_, payload) =>
          commandEffect<Commands, "notesEditor", "setDocument">(
            "notesEditor",
            "setDocument",
            { document: payload.document },
          ).chainToAction(
            () => undefined,
            error =>
              applyFailed({
                message:
                  error instanceof Error ? error.message : "Unknown error",
              }),
          ),
        ApplyFailed: (data, payload, { update }) =>
          update({
            ...data,
            error: payload.message,
          }),
      },
      { name: "Editing" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { applyClicked, applyFailed },
        states: { Editing },
      }),
      Editing({}),
      {
        commandHandlers: {
          notesEditor: {
            setDocument: () => {
              throw new Error("no editor")
            },
          },
        },
      },
    )

    await runtime.run(applyClicked({ document: "Hello" }))

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.error).toBe("no editor")
  })

  test("should noop when command handler is missing by default", async () => {
    type Commands = {
      notesEditor: {
        setEditable: {
          payload: { editable: boolean }
          result: { ok: true }
        }
      }
    }

    const toggle = action("Toggle")
    type Toggle = ActionCreatorType<typeof toggle>

    const Editing = state<Toggle, { count: number }>(
      {
        Toggle: (data, _, { update }) => [
          update({
            ...data,
            count: data.count + 1,
          }),
          commandEffect<Commands, "notesEditor", "setEditable">(
            "notesEditor",
            "setEditable",
            { editable: true },
          ).chainToAction(() => undefined),
        ],
      },
      { name: "Editing" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { toggle },
        states: { Editing },
      }),
      Editing({ count: 0 }),
    )

    await runtime.run(toggle())

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.count).toBe(1)
  })

  test("should derive command handlers from clients helper", async () => {
    type Commands = {
      notesEditor: {
        setDocument: {
          payload: { document: string }
          result: { saved: true }
        }
      }
    }

    const applyClicked = action("ApplyClicked").withPayload<{
      document: string
    }>()
    const applySucceeded = action("ApplySucceeded")
    type ApplyClicked = ActionCreatorType<typeof applyClicked>
    type ApplySucceeded = ActionCreatorType<typeof applySucceeded>

    const clients = {
      notesEditor: {
        setDocument: jest.fn(() => ({ saved: true as const })),
      },
    }

    const Editing = state<ApplyClicked | ApplySucceeded, { status: string }>(
      {
        ApplyClicked: (_, payload) =>
          commandEffect<Commands, "notesEditor", "setDocument">(
            "notesEditor",
            "setDocument",
            { document: payload.document },
          ).chainToAction(() => applySucceeded()),
        ApplySucceeded: (data, _, { update }) =>
          update({
            ...data,
            status: "applied",
          }),
      },
      { name: "Editing" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { applyClicked, applySucceeded },
        states: { Editing },
      }),
      Editing({ status: "idle" }),
      {
        clients,
        commandHandlers: commandHandlersFromClients<Commands>(clients),
      },
    )

    await runtime.run(applyClicked({ document: "Hello" }))

    expect(clients.notesEditor.setDocument).toHaveBeenCalledWith({
      document: "Hello",
    })
    expect(runtime.currentState().data.status).toBe("applied")
  })

  test("should not throw exception when sending unhandled actions", async () => {
    const trigger = action("Trigger")

    const A = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    await expect(runtime.run(trigger())).resolves.toBeUndefined()
  })

  test("should treat void return as noop", async () => {
    const A = state<Enter>({
      Enter: () => {
        return
      },
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context)

    await expect(runtime.run(enter())).resolves.toBeUndefined()
  })

  describe("Entering", () => {
    test("should enter a state and log", async () => {
      const A = state<Enter>(
        {
          Enter: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should apply context options when creating a runtime from a machine", async () => {
      const A = state<Enter>(
        {
          Enter: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()
      const machine = createMachine({
        states: { A },
      })

      const runtime = createRuntime(machine, A(), {
        customLogger,
      })

      await runtime.run(enter())

      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should enter a state and immediately run an action", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter | Next>(
        {
          Enter: () => next(),
          Next: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should enter a state and immediately go to another state", async () => {
      const A = state<Enter>(
        {
          Enter: () => B(),
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: () => log("Hello B"),
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello B"], "log")
    })

    test("should enter a state and immediately update", async () => {
      const A = state<Enter, number>(
        {
          Enter: (n, _, { update }) => update(n + 1),
        },
        { name: "A" },
      )

      const context = createInitialContext([A(1)])

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(runtime.currentState().data).toBe(2)
    })

    test("should enter a state and immediately transition then run an action", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter>(
        {
          Enter: () => [B(), next()],
        },
        { name: "A" },
      )

      const B = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => log("Next"),
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Next"], "log")
    })

    test("should preserve mixed transition and action results synchronously", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const C = state<Enter>(
        {
          Enter: noop,
        },
        { name: "C" },
      )

      const B = state<Enter | Next>(
        {
          Enter: noop,
          Next: () => C(),
        },
        { name: "B" },
      )

      const A = state<Enter>(
        {
          Enter: () => [B(), next()],
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      await runtime.run(enter())

      expect(runtime.currentState().is(C)).toBeTruthy()
    })
  })

  describe("Exit events", () => {
    test("should fire exit events", async () => {
      const A = state<Enter | Exit>(
        {
          Enter: () => [log("Enter A"), B()],
          Exit: () => log("Exit A"),
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: noop,
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], { customLogger })

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()

      expect(customLogger).toHaveBeenCalledWith(["Exit A"], "log")
    })
  })

  describe("Transitions", () => {
    test("should flatten nested state transitions", async () => {
      const A = state<Enter>(
        {
          Enter: () => [log("Enter A"), B()],
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: () => [log("Enter B"), C()],
        },
        { name: "B" },
      )

      const C = state<Enter>(
        {
          Enter: () => log("Enter C"),
        },
        { name: "C" },
      )

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(C)).toBeTruthy()
    })
  })

  describe("update", () => {
    type Data = [str: string, bool: boolean, num: number, fn: () => string]

    const update = action("Update")
    type Update = ActionCreatorType<typeof update>

    const A = state<Enter | Update, Data>({
      Enter: noop,
      Update: (data, _, { update }) => update(data),
    })

    test("should pass through original values", async () => {
      const context = createInitialContext([
        A(["Test", false, 5, () => "Inside"]),
      ])

      const runtime = new Runtime(context)
      await runtime.run(update())

      const state = runtime.currentState()

      if (!state.is(A)) {
        throw new Error("Expected state A")
      }

      const [a, b, c, d] = state.data

      expect(a).toBe("Test")
      expect(b).toBe(false)
      expect(c).toBe(5)

      expect(typeof d).toBe("function")

      if (typeof d !== "function") {
        throw new TypeError("Expected callback function")
      }

      expect((d as () => string)()).toBe("Inside")
    })
  })

  describe("goBack", () => {
    const hi = action("Hi")
    type Hi = ActionCreatorType<typeof hi>

    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Hi, string>(
      {
        Enter: noop,
        Hi: () => log("Hi"),
      },
      { name: "A" },
    )

    const B = state<Enter | Trigger>(
      {
        Enter: (data, __, { update }) => [update(data), trigger()],
        Trigger: () => [goBack(), hi()],
      },
      { name: "B" },
    )

    test("should return to previous state", async () => {
      const customLogger = jest.fn()

      const context = createInitialContext([B(), A("Test")], {
        customLogger,
      })

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(runtime.currentState().data).toBe("Test")
      expect(customLogger).toHaveBeenCalledWith(["Hi"], "log")
    })
  })

  describe("Unknown effect", () => {
    test("should throw error on unknown effect", async () => {
      const A = state<Enter>({
        Enter: () =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          (() => {
            // fake effect
          }) as any,
      })

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await expect(runtime.run(enter())).rejects.toBeInstanceOf(
        UnknownStateReturnType,
      )
    })
  })

  describe("Serialization", () => {
    test("should be able to serialize and deserialize state", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter>(
        {
          Enter: () => B({ name: "Test" }),
        },
        { name: "A" },
      )

      const B = state<Enter | Next, { name: string }>(
        {
          Enter: noop,
          Next: ({ name }) => C(name),
        },
        { name: "B" },
      )

      const C = state<Enter, string>(
        {
          Enter: noop,
        },
        { name: "C" },
      )

      function serializeContext(c: Context) {
        return JSON.stringify(
          c.history.toArray().map(({ data, name }) => ({
            data,
            name,
          })),
        )
      }

      const STATES = { A, B, C }

      function deserializeContext(s: string) {
        const unboundHistory = JSON.parse(s) as Array<{
          data: Array<any>
          name: string
        }>

        return createInitialContext(
          unboundHistory.map(({ data, name }) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
            return (STATES as any)[name](data)
          }),
        )
      }

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(context.currentState.is(B)).toBeTruthy()

      const serialized = serializeContext(context)
      const newContext = deserializeContext(serialized)

      const runtime2 = new Runtime(newContext)

      await runtime2.run(next())

      expect(newContext.currentState.is(C)).toBeTruthy()
      expect(newContext.currentState.data).toBe("Test")
    })
  })
})
