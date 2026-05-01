import { jest } from "@jest/globals"

import type { Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { defineOutputMap, output, outputCommand } from "../effect"
import { Runtime } from "../runtime"
import { state } from "../state"

describe("onOutput", () => {
  test("should transition through multiple states", async () => {
    const enterAction = enter()

    const A = state<Enter>(
      {
        Enter: () => output(enterAction),
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])

    const runtime = new Runtime(context, {}, { enter })

    const fn = jest.fn()

    runtime.onOutput(action => {
      fn(action)
    })

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(fn).toHaveBeenCalledWith(enterAction)
  })

  test("should subscribe to one output type with onOutputType", async () => {
    const notice = action("Notice").withPayload<string>()
    const warn = action("Warn").withPayload<string>()

    const A = state<Enter>(
      {
        Enter: () => [output(notice("hello")), output(warn("ignore"))],
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { notice, warn })
    const fn = jest.fn()

    runtime.onOutputType("Notice", payload => {
      fn(payload)
    })

    await runtime.run(enter())

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("hello")
  })

  test("should connect output channels and route direct outputCommand effects", async () => {
    const setDocument = action("notesEditor.setDocument").withPayload<{
      document: string
    }>()

    const A = state<Enter>(
      {
        Enter: () =>
          outputCommand("notesEditor", "setDocument", {
            document: "hello from command",
          }),
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { setDocument })
    const setDocumentHandler = jest.fn()

    runtime.connectOutputChannel({
      notesEditor: {
        setDocument: payload => {
          setDocumentHandler(payload)
        },
      },
    })

    await runtime.run(enter())

    expect(setDocumentHandler).toHaveBeenCalledWith({
      document: "hello from command",
    })
  })

  test("should infer payload from defineOutputMap when using outputCommand", async () => {
    const outputs = defineOutputMap({
      notesEditor: {
        setDocument: (payload: { document: string; readonly: boolean }) =>
          payload,
      },
    })

    const setDocument = action("notesEditor.setDocument").withPayload<{
      document: string
      readonly: boolean
    }>()

    const A = state<Enter>(
      {
        Enter: () =>
          outputCommand(outputs, "notesEditor", "setDocument", {
            document: "map inferred",
            readonly: false,
          }),
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { setDocument })
    const handler = jest.fn()

    runtime.connectOutputChannel({
      notesEditor: {
        setDocument: payload => {
          const typedDocument: string = payload.document
          const typedReadonly: boolean = payload.readonly

          handler({ typedDocument, typedReadonly })
        },
      },
    })

    await runtime.run(enter())

    expect(handler).toHaveBeenCalledWith({
      typedDocument: "map inferred",
      typedReadonly: false,
    })
  })
})
