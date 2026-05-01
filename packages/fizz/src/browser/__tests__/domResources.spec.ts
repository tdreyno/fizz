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
          dom.documentElement().resource(),
          dom.activeElement().resource(),
          dom.getElementById("root", "root-id").resource(),
          dom.getElementsByClassName("classNodes", "action").resource(),
          dom.getElementsByName("namedNodes", "resource-name").resource(),
          dom.getElementsByTagName("taggedNodes", "button").resource(),
          dom.from("root").closest("closestNode", ".cta").resource(),
          dom
            .from("root")
            .getElementsByClassName("scopedClassNodes", "action")
            .resource(),
          dom
            .from("root")
            .getElementsByTagName("scopedTagNodes", "button")
            .resource(),
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

    const resources = getStateResources(runtime.currentState())

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
})
