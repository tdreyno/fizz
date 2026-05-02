import { describe, expect, test } from "@jest/globals"
import { JSDOM } from "jsdom"

import { action, enter } from "../action.js"
import { dom } from "../browser/index.js"
import { output } from "../effect.js"
import { state } from "../state.js"
import {
  createBrowserTestHarness,
  expectCommandOrder,
  fireChange,
  fireClick,
  fireEvent,
  fireFocusIn,
  fireFocusOut,
  fireFormSubmit,
  fireInput,
  fireKeyDown,
  fireKeyUp,
  firePointerDown,
  firePointerDrag,
  firePointerMove,
  firePointerUp,
  fireSubmit,
  fireTextInput,
  flushFrames,
} from "../test.browser.js"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const submitterName = (value: HTMLElement | null): string => {
  if (value && "name" in value && typeof value.name === "string") {
    return value.name
  }

  return "form"
}

describe("browser test harness", () => {
  test("should drive document listeners and expose framework-agnostic recorded browser stubs", async () => {
    const pointerMoved = action("PointerMoved").withPayload<number>()
    const notice = action("Notice").withPayload<string>()

    const Tracking = state<
      ReturnType<typeof enter> | ReturnType<typeof pointerMoved>,
      Data
    >(
      {
        Enter: (data, _, { update }) => [
          ...dom
            .document("doc")
            .listen(
              "pointerdown",
              event =>
                pointerMoved(
                  (event.target as HTMLElement | null)?.dataset.index
                    ? Number((event.target as HTMLElement).dataset.index)
                    : -1,
                ),
              { coalesce: "animation-frame" },
            ),
          output(notice("listener-ready")),
          update(appendEvent(data, "enter")),
        ],

        PointerMoved: (data, payload, { update }) =>
          update(appendEvent(data, `pointer:${String(payload)}`)),
      },
      { name: "Tracking" },
    )

    const testDom = new JSDOM(
      '<body><button data-index="4">Outside</button></body>',
    )
    const testDocument = testDom.window.document
    const outsideNode = testDocument.querySelector("button")

    if (!(outsideNode instanceof testDom.window.HTMLElement)) {
      throw new TypeError("Expected outside node")
    }

    const harness = createBrowserTestHarness({
      document: testDocument,
      history: [Tracking({ events: [] })],
      internalActions: { pointerMoved },
      outputActions: { notice },
    })

    harness.browserDriver.confirm.mockReturnValue(true)

    await harness.start()
    firePointerDown(harness.document, { target: outsideNode })

    await flushFrames(harness, 1)

    expect(harness.currentState().data.events).toEqual(["enter", "pointer:4"])
    expect(harness.browserDriver.confirm.calls).toEqual([])
    expectCommandOrder(harness, ["Notice"])
  })

  test("should dispatch focus and keyboard helpers through bubbling listeners", async () => {
    const focused = action("Focused").withPayload<string>()
    const keyPressed = action("KeyPressed").withPayload<string>()

    const Listening = state<
      | ReturnType<typeof enter>
      | ReturnType<typeof focused>
      | ReturnType<typeof keyPressed>,
      Data
    >(
      {
        Enter: (data, _, { update }) => [
          ...dom.document("doc").listen("focusin", event => {
            const nextTarget = event.target as HTMLInputElement | null

            return focused(nextTarget?.name ?? "unknown")
          }),
          ...dom
            .document("doc")
            .listen("keydown", event => keyPressed(event.key)),
          update(appendEvent(data, "enter")),
        ],

        Focused: (data, payload, { update }) =>
          update(appendEvent(data, `focus:${payload}`)),

        KeyPressed: (data, payload, { update }) =>
          update(appendEvent(data, `key:${payload}`)),
      },
      { name: "Listening" },
    )

    const testDom = new JSDOM(
      '<body><input name="search" /><button type="button">Open</button></body>',
    )
    const testDocument = testDom.window.document
    const inputNode = testDocument.querySelector("input")

    if (!(inputNode instanceof testDom.window.HTMLInputElement)) {
      throw new TypeError("Expected input node")
    }

    const harness = createBrowserTestHarness({
      document: testDocument,
      history: [Listening({ events: [] })],
      internalActions: { focused, keyPressed },
    })

    await harness.start()

    fireFocusIn(harness.document, { target: inputNode })
    fireKeyDown(harness.document, { key: "Escape", target: inputNode })

    await harness.settle()

    expect(harness.currentState().data.events).toEqual([
      "enter",
      "focus:search",
      "key:Escape",
    ])
  })

  test("should support generic and typed event dispatch helpers", async () => {
    const clicked = action("Clicked").withPayload<string>()
    const inputSeen = action("InputSeen").withPayload<string>()
    const changed = action("Changed").withPayload<string>()
    const keyReleased = action("KeyReleased").withPayload<string>()
    const blurred = action("Blurred").withPayload<string>()
    const pointerMoved = action("PointerMoved").withPayload<number>()
    const pointerReleased = action("PointerReleased").withPayload<number>()
    const submitted = action("Submitted").withPayload<string>()

    const Listening = state<
      | ReturnType<typeof enter>
      | ReturnType<typeof clicked>
      | ReturnType<typeof inputSeen>
      | ReturnType<typeof changed>
      | ReturnType<typeof keyReleased>
      | ReturnType<typeof blurred>
      | ReturnType<typeof pointerMoved>
      | ReturnType<typeof pointerReleased>
      | ReturnType<typeof submitted>,
      Data
    >(
      {
        Enter: (data, _, { update }) => [
          ...dom
            .document("doc")
            .onClick(event =>
              clicked(
                (event.target as HTMLElement | null)?.tagName ?? "unknown",
              ),
            ),
          ...dom
            .document("doc")
            .onInput(event =>
              inputSeen((event.target as HTMLInputElement | null)?.value ?? ""),
            ),
          ...dom
            .document("doc")
            .onChange(event =>
              changed((event.target as HTMLInputElement | null)?.value ?? ""),
            ),
          ...dom.document("doc").onKeyUp(event => keyReleased(event.key)),
          ...dom
            .document("doc")
            .onFocusOut(event =>
              blurred((event.target as HTMLInputElement | null)?.name ?? ""),
            ),
          ...dom
            .document("doc")
            .onPointerMove(event => pointerMoved(event.clientX)),
          ...dom
            .document("doc")
            .onPointerUp(event => pointerReleased(event.clientX)),
          ...dom
            .document("doc")
            .onSubmit(event => submitted(submitterName(event.submitter))),
          update(appendEvent(data, "enter")),
        ],

        Clicked: (data, payload, { update }) =>
          update(appendEvent(data, `click:${payload.toLowerCase()}`)),

        InputSeen: (data, payload, { update }) =>
          update(appendEvent(data, `input:${payload}`)),

        Changed: (data, payload, { update }) =>
          update(appendEvent(data, `change:${payload}`)),

        KeyReleased: (data, payload, { update }) =>
          update(appendEvent(data, `keyup:${payload}`)),

        Blurred: (data, payload, { update }) =>
          update(appendEvent(data, `blur:${payload}`)),

        PointerMoved: (data, payload, { update }) =>
          update(appendEvent(data, `move:${String(payload)}`)),

        PointerReleased: (data, payload, { update }) =>
          update(appendEvent(data, `up:${String(payload)}`)),

        Submitted: (data, payload, { update }) =>
          update(appendEvent(data, `submit:${payload}`)),
      },
      { name: "Listening" },
    )

    const testDom = new JSDOM(
      '<body><form><input name="query" /><button name="save" type="button">Save</button><div data-drag="surface"></div></form></body>',
    )
    const testDocument = testDom.window.document
    const formNode = testDocument.querySelector("form")
    const inputNode = testDocument.querySelector("input")
    const buttonNode = testDocument.querySelector("button")
    const dragSurface = testDocument.querySelector("div")

    if (!(formNode instanceof testDom.window.HTMLFormElement)) {
      throw new TypeError("Expected form node")
    }

    if (!(inputNode instanceof testDom.window.HTMLInputElement)) {
      throw new TypeError("Expected input node")
    }

    if (!(buttonNode instanceof testDom.window.HTMLButtonElement)) {
      throw new TypeError("Expected button node")
    }

    if (!(dragSurface instanceof testDom.window.HTMLDivElement)) {
      throw new TypeError("Expected drag surface")
    }

    const harness = createBrowserTestHarness({
      document: testDocument,
      history: [Listening({ events: [] })],
      internalActions: {
        blurred,
        changed,
        clicked,
        inputSeen,
        keyReleased,
        pointerMoved,
        pointerReleased,
        submitted,
      },
    })

    await harness.start()

    fireEvent(buttonNode, "click")
    fireClick(buttonNode)
    inputNode.value = "Ada"
    fireInput(inputNode, { data: "Ada" })
    fireChange(inputNode)
    fireKeyUp(inputNode, { key: "Enter" })
    fireFocusOut(inputNode)
    firePointerMove(dragSurface, { clientX: 11 })
    firePointerUp(dragSurface, { clientX: 23 })
    fireSubmit(formNode, { submitter: buttonNode })

    await harness.settle()

    expect(harness.currentState().data.events).toEqual([
      "enter",
      "click:button",
      "click:button",
      "input:Ada",
      "change:Ada",
      "keyup:Enter",
      "blur:query",
      "move:11",
      "up:23",
      "submit:save",
    ])
  })

  test("should support pointer, text, and form interaction sequences", async () => {
    const pointerDown = action("PointerDown").withPayload<number>()
    const pointerMoved = action("PointerMoved").withPayload<number>()
    const pointerUp = action("PointerUp").withPayload<number>()
    const focused = action("Focused").withPayload<string>()
    const keyPressed = action("KeyPressed").withPayload<string>()
    const keyReleased = action("KeyReleased").withPayload<string>()
    const inputSeen = action("InputSeen").withPayload<string>()
    const changed = action("Changed").withPayload<string>()
    const clicked = action("Clicked").withPayload<string>()
    const submitted = action("Submitted").withPayload<string>()

    const Listening = state<
      | ReturnType<typeof enter>
      | ReturnType<typeof pointerDown>
      | ReturnType<typeof pointerMoved>
      | ReturnType<typeof pointerUp>
      | ReturnType<typeof focused>
      | ReturnType<typeof keyPressed>
      | ReturnType<typeof keyReleased>
      | ReturnType<typeof inputSeen>
      | ReturnType<typeof changed>
      | ReturnType<typeof clicked>
      | ReturnType<typeof submitted>,
      Data
    >(
      {
        Enter: (data, _, { update }) => [
          ...dom
            .document("doc")
            .onPointerDown(event => pointerDown(event.clientX)),
          ...dom
            .document("doc")
            .onPointerMove(event => pointerMoved(event.clientX)),
          ...dom.document("doc").onPointerUp(event => pointerUp(event.clientX)),
          ...dom
            .document("doc")
            .onFocusIn(event =>
              focused((event.target as HTMLInputElement | null)?.name ?? ""),
            ),
          ...dom.document("doc").onKeyDown(event => keyPressed(event.key)),
          ...dom.document("doc").onKeyUp(event => keyReleased(event.key)),
          ...dom
            .document("doc")
            .onInput(event =>
              inputSeen((event.target as HTMLInputElement | null)?.value ?? ""),
            ),
          ...dom
            .document("doc")
            .onChange(event =>
              changed((event.target as HTMLInputElement | null)?.value ?? ""),
            ),
          ...dom
            .document("doc")
            .onClick(event =>
              clicked((event.target as HTMLButtonElement | null)?.name ?? ""),
            ),
          ...dom
            .document("doc")
            .onSubmit(event => submitted(submitterName(event.submitter))),
          update(appendEvent(data, "enter")),
        ],

        PointerDown: (data, payload, { update }) =>
          update(appendEvent(data, `down:${String(payload)}`)),

        PointerMoved: (data, payload, { update }) =>
          update(appendEvent(data, `move:${String(payload)}`)),

        PointerUp: (data, payload, { update }) =>
          update(appendEvent(data, `up:${String(payload)}`)),

        Focused: (data, payload, { update }) =>
          update(appendEvent(data, `focus:${payload}`)),

        KeyPressed: (data, payload, { update }) =>
          update(appendEvent(data, `keydown:${payload}`)),

        KeyReleased: (data, payload, { update }) =>
          update(appendEvent(data, `keyup:${payload}`)),

        InputSeen: (data, payload, { update }) =>
          update(appendEvent(data, `input:${payload}`)),

        Changed: (data, payload, { update }) =>
          update(appendEvent(data, `change:${payload}`)),

        Clicked: (data, payload, { update }) =>
          update(appendEvent(data, `click:${payload}`)),

        Submitted: (data, payload, { update }) =>
          update(appendEvent(data, `submit:${payload}`)),
      },
      { name: "Listening" },
    )

    const testDom = new JSDOM(
      '<body><form><input name="query" /><button name="save" type="button">Save</button><div data-drag="surface"></div></form></body>',
    )
    const testDocument = testDom.window.document
    const inputNode = testDocument.querySelector("input")
    const buttonNode = testDocument.querySelector("button")
    const dragSurface = testDocument.querySelector("div")
    const formNode = testDocument.querySelector("form")

    if (!(inputNode instanceof testDom.window.HTMLInputElement)) {
      throw new TypeError("Expected input node")
    }

    if (!(buttonNode instanceof testDom.window.HTMLButtonElement)) {
      throw new TypeError("Expected button node")
    }

    if (!(dragSurface instanceof testDom.window.HTMLDivElement)) {
      throw new TypeError("Expected drag surface")
    }

    if (!(formNode instanceof testDom.window.HTMLFormElement)) {
      throw new TypeError("Expected form node")
    }

    const harness = createBrowserTestHarness({
      document: testDocument,
      history: [Listening({ events: [] })],
      internalActions: {
        changed,
        clicked,
        focused,
        inputSeen,
        keyPressed,
        keyReleased,
        pointerDown,
        pointerMoved,
        pointerUp,
        submitted,
      },
    })

    await harness.start()

    firePointerDrag(dragSurface, {
      end: { clientX: 12 },
      moves: [{ clientX: 4 }, { clientX: 8 }],
      start: { clientX: 1 },
    })
    fireTextInput(inputNode, { key: "a", value: "Ada" })
    fireFormSubmit(formNode, { submitter: buttonNode })

    await harness.settle()

    expect(harness.currentState().data.events).toEqual([
      "enter",
      "down:1",
      "move:4",
      "move:8",
      "up:12",
      "focus:query",
      "keydown:a",
      "input:Ada",
      "keyup:a",
      "change:Ada",
      "click:save",
      "submit:save",
    ])
  })
})
