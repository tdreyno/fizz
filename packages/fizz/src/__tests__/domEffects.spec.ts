import { describe, expect, test } from "@jest/globals"

import { action } from "../action.js"
import { dom } from "../browser/domEffects.js"

describe("dom effects", () => {
  test("creates singleton acquires with default and custom ids", () => {
    expect(dom.body().label).toBe("domAcquire")
    expect(dom.body().data).toEqual({
      kind: "singleton",
      resourceId: "body",
      target: "body",
    })

    expect(dom.window("win").data).toEqual({
      kind: "singleton",
      resourceId: "win",
      target: "window",
    })

    expect(dom.history().data).toEqual({
      kind: "singleton",
      resourceId: "history",
      target: "history",
    })

    expect(dom.location("loc").data).toEqual({
      kind: "singleton",
      resourceId: "loc",
      target: "location",
    })
  })

  test("creates query acquires for root and scoped builders", () => {
    expect(dom.querySelector("item", ".item").data).toEqual({
      args: [".item"],
      kind: "query",
      method: "querySelector",
      resourceId: "item",
    })

    expect(dom.closest("closestItem", "list", ".item").data).toEqual({
      args: [".item"],
      kind: "query",
      method: "closest",
      resourceId: "closestItem",
      scopeResourceId: "list",
    })

    const scoped = dom.from("container")

    expect(scoped.getElementById("btn", "submit").data).toEqual({
      args: ["submit"],
      kind: "query",
      method: "getElementById",
      resourceId: "btn",
      scopeResourceId: "container",
    })

    expect(scoped.getElementsByTagName("rows", "li").data).toEqual({
      args: ["li"],
      kind: "query",
      method: "getElementsByTagName",
      resourceId: "rows",
      scopeResourceId: "container",
    })
  })

  test("creates external acquire from known element", () => {
    const element = { id: "node-1" }

    expect(dom.fromElement("node", element).data).toEqual({
      element,
      kind: "external",
      resourceId: "node",
    })
  })

  test("listen handles boolean options and coalesce object options", () => {
    const moved = action("Moved")
    const builder = dom.window("window")

    const withBoolean = builder.listen("scroll", () => moved(), true)

    expect(withBoolean).toHaveLength(2)
    expect(withBoolean[1]?.label).toBe("domListen")
    expect(withBoolean[1]?.data).toEqual({
      options: true,
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "scroll",
    })

    const withCoalesce = builder.listen("pointermove", () => moved(), {
      coalesce: "animation-frame",
      passive: true,
    })

    expect(withCoalesce[1]?.data).toEqual({
      coalesce: "animation-frame",
      options: { passive: true },
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "pointermove",
    })

    const coalesceOnly = builder.listen("mousemove", () => moved(), {
      coalesce: "microtask",
    })

    expect(coalesceOnly[1]?.data).toEqual({
      coalesce: "microtask",
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mousemove",
    })

    const withoutOptions = builder.listen("mouseup", () => moved())

    expect(withoutOptions[1]?.data).toEqual({
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mouseup",
    })
  })

  test("onEvent helpers map to listen with target-specific typing", () => {
    const moved = action("Moved").withPayload<string>()

    const windowEffects = dom
      .window("window")
      .onMouseDown(event => moved(event.type), { passive: true })

    expect(windowEffects[1]?.data).toEqual({
      options: { passive: true },
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mousedown",
    })

    const historyEffects = dom.history().onPopState(event => moved(event.type))

    expect(historyEffects[1]?.data).toEqual({
      targetResourceId: "history",
      toAction: expect.any(Function),
      type: "popstate",
    })

    const locationEffects = dom
      .location()
      .onHashChange(event => moved(event.type))

    expect(locationEffects[1]?.data).toEqual({
      targetResourceId: "location",
      toAction: expect.any(Function),
      type: "hashchange",
    })

    dom.window().onKeyDown(event => moved(event.key))

    // @ts-expect-error onPopState is not a valid helper for location targets
    const missingHelper: ReturnType<typeof dom.location>["onPopState"] = null

    expect(missingHelper).toBeNull()
  })

  test("mutate and resource preserve target resource id", () => {
    const builder = dom.document("document-root")
    const effects = builder.mutate(() => undefined)

    expect(effects).toHaveLength(2)
    expect(effects[0]?.label).toBe("domAcquire")
    expect(effects[1]?.label).toBe("domMutate")
    expect(effects[1]?.data).toEqual({
      fn: expect.any(Function),
      targetResourceId: "document-root",
    })

    expect(builder.resource()).toBe(builder)
  })

  test("observeIntersection supports overloads with and without observer id", () => {
    const visible = action("Visible")
    const builder = dom.body("body")

    const withOptions = builder.observeIntersection(() => visible(), {
      threshold: 0.5,
    })

    expect(withOptions[1]?.label).toBe("domObserveIntersection")
    expect(withOptions[1]?.data).toEqual({
      options: { threshold: 0.5 },
      targetResourceId: "body",
      toAction: expect.any(Function),
    })

    const withObserverId = builder.observeIntersection(
      "observer-1",
      () => visible(),
      { rootMargin: "10px" },
    )

    expect(withObserverId[1]?.data).toEqual({
      observerId: "observer-1",
      options: { rootMargin: "10px" },
      targetResourceId: "body",
      toAction: expect.any(Function),
    })
  })

  test("observeResize supports overloads with and without observer id", () => {
    const resized = action("Resized")
    const builder = dom.body("body")

    const withOptions = builder.observeResize(() => resized(), {
      box: "border-box",
    })

    expect(withOptions[1]?.label).toBe("domObserveResize")
    expect(withOptions[1]?.data).toEqual({
      options: { box: "border-box" },
      targetResourceId: "body",
      toAction: expect.any(Function),
    })

    const withObserverId = builder.observeResize("resize-1", () => resized(), {
      box: "content-box",
    })

    expect(withObserverId[1]?.data).toEqual({
      observerId: "resize-1",
      options: { box: "content-box" },
      targetResourceId: "body",
      toAction: expect.any(Function),
    })
  })

  test("covers remaining top-level dom helpers", () => {
    expect(dom.activeElement().data).toEqual({
      kind: "singleton",
      resourceId: "activeElement",
      target: "activeElement",
    })

    expect(dom.documentElement().data).toEqual({
      kind: "singleton",
      resourceId: "documentElement",
      target: "documentElement",
    })

    expect(dom.visualViewport().data).toEqual({
      kind: "singleton",
      resourceId: "visualViewport",
      target: "visualViewport",
    })

    expect(dom.getElementsByClassName("items", "card").data).toEqual({
      args: ["card"],
      kind: "query",
      method: "getElementsByClassName",
      resourceId: "items",
    })

    expect(dom.getElementsByName("named", "q").data).toEqual({
      args: ["q"],
      kind: "query",
      method: "getElementsByName",
      resourceId: "named",
    })

    expect(dom.getElementsByTagName("rows", "li").data).toEqual({
      args: ["li"],
      kind: "query",
      method: "getElementsByTagName",
      resourceId: "rows",
    })

    expect(dom.querySelectorAll("all-items", ".item").data).toEqual({
      args: [".item"],
      kind: "query",
      method: "querySelectorAll",
      resourceId: "all-items",
    })

    const scoped = dom.from("container")

    expect(scoped.getElementsByClassName("cards", "card").data).toEqual({
      args: ["card"],
      kind: "query",
      method: "getElementsByClassName",
      resourceId: "cards",
      scopeResourceId: "container",
    })

    expect(scoped.getElementsByName("inputs", "email").data).toEqual({
      args: ["email"],
      kind: "query",
      method: "getElementsByName",
      resourceId: "inputs",
      scopeResourceId: "container",
    })

    expect(scoped.querySelectorAll("found", ".match").data).toEqual({
      args: [".match"],
      kind: "query",
      method: "querySelectorAll",
      resourceId: "found",
      scopeResourceId: "container",
    })
  })
})
