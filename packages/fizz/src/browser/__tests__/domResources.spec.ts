import "../index"

import { describe, expect, test } from "@jest/globals"

import type { Enter } from "../../action"
import { enter } from "../../action"
import { createInitialContext } from "../../context"
import { Runtime } from "../../runtime"
import { state } from "../../state"
import { getStateResources } from "../../stateResources"
import { dom } from "../domEffects"
import { createMockDomDriver, MockElementTarget } from "./domTestUtils"

describe("DOM resources", () => {
  test("should acquire singleton resources and scoped queries via dom.from", async () => {
    const rootElement = new MockElementTarget()
    const closestResult = new MockElementTarget() as unknown as Element
    const classElement = new MockElementTarget() as unknown as Element
    const namedElement = new MockElementTarget() as unknown as Element
    const taggedElement = new MockElementTarget() as unknown as Element

    rootElement.closestResults.set(".cta", closestResult)

    const mock = createMockDomDriver()

    mock.query.byId.set("root-id", rootElement as unknown as Element)
    mock.query.byClassName.set("action", [classElement])
    mock.query.byName.set("resource-name", [namedElement])
    mock.query.byTagName.set("button", [taggedElement])

    const Browsing = state<Enter>(
      {
        Enter: () => [
          dom.documentElement(),
          dom.activeElement(),
          dom.getElementById("root-id", "root"),
          dom.getElementsByClassName("action", "classNodes"),
          dom.getElementsByName("resource-name", "namedNodes"),
          dom.getElementsByTagName("button", "taggedNodes"),
          dom.from("root").closest(".cta", "closestNode"),
          dom.from("root").getElementsByClassName("action", "scopedClassNodes"),
          dom.from("root").getElementsByTagName("button", "scopedTagNodes"),
        ],
      },
      { name: "Browsing" },
    )

    const runtime = new Runtime(
      createInitialContext([Browsing()]),
      {},
      {},
      {
        browserDriver: mock.driver,
      },
    )

    await runtime.run(enter())

    const current = runtime.currentState()
    const resources = getStateResources(current)

    expect(resources["documentElement"]).toBeDefined()
    expect(resources["activeElement"]).toBeDefined()
    expect(resources["root"]).toBe(rootElement)
    expect(resources["closestNode"]).toBe(closestResult)
    expect(resources["classNodes"]).toEqual([classElement])
    expect(resources["namedNodes"]).toEqual([namedElement])
    expect(resources["taggedNodes"]).toEqual([taggedElement])
    expect(resources["scopedClassNodes"]).toEqual([classElement])
    expect(resources["scopedTagNodes"]).toEqual([taggedElement])
  })

  test("should acquire history and location singleton resources", async () => {
    const mock = createMockDomDriver()

    const Browsing = state<Enter>(
      {
        Enter: () => [dom.history(), dom.location()],
      },
      { name: "Browsing" },
    )

    const runtime = new Runtime(
      createInitialContext([Browsing()]),
      {},
      {},
      {
        browserDriver: mock.driver,
      },
    )

    await runtime.run(enter())

    const current = runtime.currentState()
    const resources = getStateResources(current)

    expect(resources["history"]).toBe(mock.emit.history)
    expect(resources["location"]).toBe(mock.emit.location)
  })

  test("should acquire provided elements via dom.fromElement", async () => {
    const providedElement = new MockElementTarget()
    let capturedElement: MockElementTarget | undefined

    const Browsing = state<Enter>(
      {
        Enter: () =>
          dom
            .fromElement(providedElement as unknown as Element, "provided")
            .mutate(element => {
              capturedElement = element
            }),
      },
      { name: "Browsing" },
    )

    const runtime = new Runtime(createInitialContext([Browsing()]), {}, {}, {})

    await runtime.run(enter())

    const current = runtime.currentState()
    const resources = getStateResources(current)

    expect(resources["provided"]).toBe(providedElement)
    expect(capturedElement).toBe(providedElement)
  })

  test("should support listen chaining from dom.fromElement", async () => {
    const providedElement = new MockElementTarget()

    const Browsing = state<Enter>(
      {
        Enter: () =>
          dom
            .fromElement(providedElement as unknown as Element, "provided")
            .listen("click", () => enter()),
      },
      { name: "Browsing" },
    )

    const runtime = new Runtime(
      createInitialContext([Browsing()]),
      {},
      {},
      {
        browserDriver: createMockDomDriver().driver,
      },
    )

    await runtime.run(enter())
    expect(providedElement.listenerCount("click")).toBe(1)
  })

  test("should support mutator chaining from dom.fromElement effect returns", async () => {
    const providedElement = Object.assign(new MockElementTarget(), {
      value: "",
    })
    let dispatchCount = 0

    providedElement.addEventListener("input", () => {
      dispatchCount += 1
    })

    const Browsing = state<Enter>(
      {
        Enter: () =>
          dom
            .fromElement(providedElement as unknown as Element, "provided")
            .setValue("serialized-location")
            .mutate(element => {
              const EventCtor =
                element.ownerDocument?.defaultView?.Event ?? globalThis.Event

              element.dispatchEvent(new EventCtor("input", { bubbles: true }))
            }),
      },
      { name: "Browsing" },
    )

    const runtime = new Runtime(createInitialContext([Browsing()]), {}, {}, {})

    await runtime.run(enter())

    expect(providedElement.value).toBe("serialized-location")
    expect(dispatchCount).toBe(1)
  })
})
