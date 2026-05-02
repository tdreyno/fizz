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
          dom.getElementById("root", "root-id"),
          dom.getElementsByClassName("classNodes", "action"),
          dom.getElementsByName("namedNodes", "resource-name"),
          dom.getElementsByTagName("taggedNodes", "button"),
          dom.from("root").closest("closestNode", ".cta"),
          dom.from("root").getElementsByClassName("scopedClassNodes", "action"),
          dom.from("root").getElementsByTagName("scopedTagNodes", "button"),
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
            .fromElement("provided", providedElement as unknown as Element)
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
            .fromElement("provided", providedElement as unknown as Element)
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
})
