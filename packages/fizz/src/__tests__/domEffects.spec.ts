import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action.js"
import { dom, isBypassedLinkActivation } from "../browser/domEffects.js"

const keyboardEventLike = (
  key: string,
  options?: {
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    repeat?: boolean
    shiftKey?: boolean
  },
) =>
  ({
    altKey: options?.altKey ?? false,
    ctrlKey: options?.ctrlKey ?? false,
    key,
    metaKey: options?.metaKey ?? false,
    repeat: options?.repeat ?? false,
    shiftKey: options?.shiftKey ?? false,
  }) as unknown as KeyboardEvent

const nodeLike = (parent?: { parentElement: unknown }) =>
  ({
    contains(target: unknown) {
      let current = target as { parentElement?: unknown } | undefined

      while (current) {
        if (current === this) {
          return true
        }

        current = current.parentElement as
          | { parentElement?: unknown }
          | undefined
      }

      return false
    },
    nodeType: 1,
    parentElement: parent,
  }) as unknown as Element

type ListenerAction = ReturnType<typeof action> | undefined

describe("dom effects", () => {
  test("creates singleton acquires with default and custom ids", () => {
    expect(dom.body().label).toBe("domChain")
    expect(dom.body().data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "body",
      target: "body",
    })

    expect(dom.window("win").data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "win",
      target: "window",
    })

    expect(dom.history().data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "history",
      target: "history",
    })

    expect(dom.location("loc").data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "loc",
      target: "location",
    })
  })

  test("creates query acquires for root and scoped builders", () => {
    expect(dom.querySelector(".item", "item").data.acquire.data).toEqual({
      args: [".item"],
      kind: "query",
      method: "querySelector",
      resourceId: "item",
    })

    expect(
      dom.closest("list", ".item", "closestItem").data.acquire.data,
    ).toEqual({
      args: [".item"],
      kind: "query",
      method: "closest",
      resourceId: "closestItem",
      scopeResourceId: "list",
    })

    const scoped = dom.from("container")

    expect(scoped.getElementById("submit", "btn").data.acquire.data).toEqual({
      args: ["submit"],
      kind: "query",
      method: "getElementById",
      resourceId: "btn",
      scopeResourceId: "container",
    })

    expect(scoped.getElementsByTagName("li", "rows").data.acquire.data).toEqual(
      {
        args: ["li"],
        kind: "query",
        method: "getElementsByTagName",
        resourceId: "rows",
        scopeResourceId: "container",
      },
    )
  })

  test("creates external acquire from known element", () => {
    const element = { id: "node-1" }

    expect(dom.fromElement(element, "node").data.acquire.data).toEqual({
      element,
      kind: "external",
      resourceId: "node",
    })
  })

  test("ownerDocument creates a scoped query builder from an element resource", () => {
    const element = { id: "node-1" } as unknown as Element
    const acquire = dom.fromElement(element, "node").ownerDocument()
    const data = acquire.data.acquire.data as {
      args: string[]
      kind: string
      method: string
      resourceId: string
      scopeResourceId: string
    }

    expect(data.kind).toBe("query")
    expect(data.method).toBe("ownerDocument")
    expect(data.args).toEqual([])
    expect(data.scopeResourceId).toBe("node")
    expect(typeof data.resourceId).toBe("string")
    expect(data.resourceId.length).toBeGreaterThan(0)
  })

  test("listen handles boolean options and coalesce object options", () => {
    const moved = action("Moved")
    const builder = dom.window("window")

    const withBoolean = builder.listen("scroll", () => moved(), true)

    expect(withBoolean.label).toBe("domChain")
    expect(withBoolean.data.listeners).toHaveLength(1)
    expect(withBoolean.data.listeners[0]?.label).toBe("domListen")
    expect(withBoolean.data.listeners[0]?.data).toEqual({
      options: true,
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "scroll",
    })

    const withCoalesce = builder.listen("pointermove", () => moved(), {
      coalesce: "animation-frame",
      passive: true,
    })

    expect(withCoalesce.data.listeners[1]?.data).toEqual({
      coalesce: "animation-frame",
      options: { passive: true },
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "pointermove",
    })

    const coalesceOnly = builder.listen("mousemove", () => moved(), {
      coalesce: "microtask",
    })

    expect(coalesceOnly.data.listeners[2]?.data).toEqual({
      coalesce: "microtask",
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mousemove",
    })

    const withoutOptions = builder.listen("mouseup", () => moved())

    expect(withoutOptions.data.listeners[3]?.data).toEqual({
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

    expect(windowEffects.data.listeners[0]?.data).toEqual({
      options: { passive: true },
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mousedown",
    })

    const historyEffects = dom.history().onPopState(event => moved(event.type))

    expect(historyEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "history",
      toAction: expect.any(Function),
      type: "popstate",
    })

    const locationEffects = dom
      .location()
      .onHashChange(event => moved(event.type))

    expect(locationEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "location",
      toAction: expect.any(Function),
      type: "hashchange",
    })

    dom.window().onKeyDown(event => moved(event.key))

    // @ts-expect-error onPopState is not a valid helper for location targets
    const missingHelper: ReturnType<typeof dom.location>["onPopState"] = null

    expect(missingHelper).toBeNull()
  })

  test("no-handler chaining works on listen and onEVENT helpers", () => {
    const matched = action("Matched")
    const fallback = action("Fallback")

    const genericListenEffects = dom
      .document()
      .listen("click")
      .chainToAction(matched, fallback)

    expect(genericListenEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "document",
      toAction: expect.any(Function),
      type: "click",
    })

    const onEventEffects = dom
      .window()
      .onMouseDown()
      .onlyPrimaryButton()
      .chainToAction(matched, fallback)

    expect(onEventEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "window",
      toAction: expect.any(Function),
      type: "mousedown",
    })

    const historyEffects = dom
      .history()
      .onPopState()
      .chainToAction(matched, fallback)

    expect(historyEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "history",
      toAction: expect.any(Function),
      type: "popstate",
    })

    const locationEffects = dom
      .location()
      .onHashChange()
      .chainToAction(matched, fallback)

    expect(locationEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "location",
      toAction: expect.any(Function),
      type: "hashchange",
    })
  })

  test("listen supports fluent keyboard chaining with matchesKey", () => {
    const matched = action("Matched")
    const ignored = action("Ignored")

    const effects = dom
      .document()
      .listen("keydown")
      .matchesKey("Enter")
      .chainToAction(matched, ignored)

    expect(effects.data.listeners[0]?.label).toBe("domListen")
    expect(effects.data.listeners[0]?.data).toEqual({
      targetResourceId: "document",
      toAction: expect.any(Function),
      type: "keydown",
    })

    const toAction = effects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(toAction?.(keyboardEventLike("Enter"))?.type).toBe("Matched")
    expect(toAction?.(keyboardEventLike("Escape"))?.type).toBe("Ignored")
  })

  test("fluent mapEvent and when preserve mapped value inference", () => {
    const matched = action("MappedMatch").withPayload<number>()
    const ignored = action("MappedIgnored")

    const effects = dom
      .document()
      .onKeyDown()
      .mapEvent(event => event.key.length)
      .when((_event, mappedLength) => mappedLength > 1)
      .chainToAction(matched, ignored)

    const toAction = effects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(toAction?.(keyboardEventLike("ok"))?.payload).toBe(2)
    expect(toAction?.(keyboardEventLike("x"))?.type).toBe("MappedIgnored")

    // @ts-expect-error mapped value is number after mapEvent
    dom
      .document()
      .onKeyDown()
      .mapEvent(event => event.key.length)
      .chainToAction((value: string) => matched(value.length))
  })

  test("fluent helpers cover once/repeat/preventDefault/stopPropagation branches", () => {
    const matched = action("Matched")
    const ignored = action("Ignored")
    const preventDefault = jest.fn()
    const stopPropagation = jest.fn()

    const effects = dom
      .document()
      .listen("keydown")
      .matchesKeyCombo({
        ctrlKey: true,
        key: "k",
      })
      .withoutKeyRepeat()
      .preventDefault()
      .stopPropagation()
      .once()
      .chainToAction(matched, ignored)

    const toAction = effects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(
      toAction?.({
        ...keyboardEventLike("k", {
          ctrlKey: true,
          repeat: false,
        }),
        preventDefault,
        stopPropagation,
      })?.type,
    ).toBe("Matched")
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()

    expect(
      toAction?.(
        keyboardEventLike("k", {
          ctrlKey: true,
          repeat: false,
        }),
      ),
    ).toBeUndefined()

    const repeatEffects = dom
      .document()
      .listen("keydown")
      .withKeyRepeat()
      .chainToAction(matched, ignored)
    const repeatToAction = repeatEffects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(
      repeatToAction?.(
        keyboardEventLike("k", {
          repeat: true,
        }),
      )?.type,
    ).toBe("Matched")
    expect(
      repeatToAction?.(
        keyboardEventLike("k", {
          repeat: false,
        }),
      )?.type,
    ).toBe("Ignored")
  })

  test("noModifiers and onlyPrimaryButton handle non-key and non-mouse events", () => {
    const matched = action("Matched")
    const ignored = action("Ignored")

    const keyEffects = dom
      .document()
      .listen("keydown")
      .noModifiers()
      .chainToAction(matched, ignored)
    const keyToAction = keyEffects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(keyToAction?.(new Event("keydown"))?.type).toBe("Matched")
    expect(
      keyToAction?.(
        keyboardEventLike("Enter", {
          altKey: true,
        }),
      )?.type,
    ).toBe("Ignored")

    const pointerEffects = dom
      .document()
      .listen("pointerdown")
      .onlyPrimaryButton()
      .chainToAction(matched, ignored)
    const pointerToAction = pointerEffects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(pointerToAction?.(new Event("pointerdown"))?.type).toBe("Ignored")
    expect(pointerToAction?.({ button: 1 })?.type).toBe("Ignored")
    expect(pointerToAction?.({ button: 0 })?.type).toBe("Matched")
  })

  test("onKeyPress supports no-handler fluent chain and optional no-match", () => {
    const matched = action("Matched")

    const effects = dom
      .document()
      .onKeyPress()
      .matchesKey("Enter")
      .chainToAction(matched)

    expect(effects.data.listeners[0]?.data).toEqual({
      targetResourceId: "document",
      toAction: expect.any(Function),
      type: "keypress",
    })

    const toAction = effects.data.listeners[0]?.data?.toAction as
      | ((event: Event) => ListenerAction)
      | undefined

    expect(toAction?.(keyboardEventLike("Enter"))?.type).toBe("Matched")
    expect(toAction?.(keyboardEventLike("Escape"))).toBeUndefined()
  })

  test("outsidePointerDown and outsideFocusIn helpers chain as document listeners", () => {
    const outside = action("Outside")
    const inside = action("Inside")

    const root = nodeLike()
    const child = nodeLike(root)
    const trigger = nodeLike()
    const external = nodeLike()

    const pointerEffects = dom
      .outsidePointerDown({ includeTrigger: trigger, inside: [root] })
      .chainToAction(outside, inside)

    expect(pointerEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "document",
      toAction: expect.any(Function),
      type: "pointerdown",
    })

    const pointerToAction = pointerEffects.data.listeners[0]?.data?.toAction as
      | ((
          event: Event,
        ) => ReturnType<typeof outside> | ReturnType<typeof inside> | undefined)
      | undefined

    expect(pointerToAction?.({ target: child } as unknown as Event)?.type).toBe(
      "Inside",
    )
    expect(
      pointerToAction?.({ target: trigger } as unknown as Event)?.type,
    ).toBe("Inside")
    expect(
      pointerToAction?.({ target: external } as unknown as Event)?.type,
    ).toBe("Outside")

    const focusEffects = dom
      .outsideFocusIn({ includeTrigger: trigger, inside: [root] })
      .chainToAction(outside, inside)

    expect(focusEffects.data.listeners[0]?.data).toEqual({
      targetResourceId: "document",
      toAction: expect.any(Function),
      type: "focusin",
    })

    const focusToAction = focusEffects.data.listeners[0]?.data?.toAction as
      | ((
          event: Event,
        ) => ReturnType<typeof outside> | ReturnType<typeof inside> | undefined)
      | undefined

    const focusWithoutInsideEffects = dom
      .outsideFocusIn({
        inside: [root],
      })
      .chainToAction(outside)
    const focusWithoutInsideToAction = focusWithoutInsideEffects.data
      .listeners[0]?.data?.toAction as
      | ((event: Event) => ReturnType<typeof outside> | undefined)
      | undefined

    expect(focusToAction?.({ target: {} } as unknown as Event)?.type).toBe(
      "Inside",
    )
    expect(
      focusWithoutInsideToAction?.({ target: {} } as unknown as Event),
    ).toBeUndefined()
  })

  test("isBypassedLinkActivation matches common SPA bypass checks", () => {
    expect(
      isBypassedLinkActivation({
        altKey: false,
        button: 0,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(false)

    expect(
      isBypassedLinkActivation({
        altKey: false,
        button: 1,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(true)

    expect(
      isBypassedLinkActivation({
        altKey: false,
        button: 0,
        ctrlKey: true,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(true)
  })

  test("mutate and resource preserve target resource id", () => {
    const builder = dom.document("document-root")
    const effects = builder.mutate(() => undefined)

    expect(effects).toHaveLength(2)
    expect(effects[0]?.label).toBe("domChain")
    expect(effects[1]?.label).toBe("domMutate")
    expect(effects[1]?.data).toEqual({
      fn: expect.any(Function),
      targetResourceId: "document-root",
    })

    expect(builder.resource()).toBe(builder)
  })

  test("classList emits domMutate that applies remove/replace/toggle/add in order", () => {
    const builder = dom.body("body")
    const effects = builder.classList({
      add: ["open"],
      remove: ["closed"],
      replace: [["state-a", "state-b"]],
      toggle: ["pinned"],
    })

    expect(effects).toHaveLength(2)
    expect(effects[0]?.label).toBe("domChain")
    expect(effects[1]?.label).toBe("domMutate")
    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
      targetResourceId: string
    }
    expect(data.targetResourceId).toBe("body")
    expect(data.label).toBe(
      "classList(remove:closed replace:state-a->state-b toggle:pinned add:open)",
    )

    const calls: string[] = []
    const fakeClassList = {
      add: (...tokens: string[]) => calls.push(`add:${tokens.join(",")}`),
      remove: (...tokens: string[]) => calls.push(`remove:${tokens.join(",")}`),
      replace: (from: string, to: string) =>
        calls.push(`replace:${from}->${to}`),
      toggle: (token: string) => calls.push(`toggle:${token}`),
    }
    data.fn({ classList: fakeClassList })

    expect(calls).toEqual([
      "remove:closed",
      "replace:state-a->state-b",
      "toggle:pinned",
      "add:open",
    ])
  })

  test("classList applies operations across NodeList-like targets", () => {
    const builder = dom.querySelectorAll(".item", "items")
    const effects = builder.classList({ add: ["active"] })
    const fn = (effects[1]?.data as { fn: (t: unknown) => void }).fn

    // Plain object with classList is treated as a single element.
    const addCalls: string[][] = []
    const singleNode = {
      classList: {
        add: (...tokens: string[]) => addCalls.push(tokens),
        remove: () => undefined,
        replace: () => undefined,
        toggle: () => undefined,
      },
    }
    fn(singleNode)
    expect(addCalls).toEqual([["active"]])
  })

  test("classList accepts string and single tuple shorthands", () => {
    const builder = dom.body("body")
    const effects = builder.classList({
      remove: "closed",
      replace: ["state-a", "state-b"],
      toggle: "pinned",
      add: "open",
    })

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }
    expect(data.label).toBe(
      "classList(remove:closed replace:state-a->state-b toggle:pinned add:open)",
    )

    const calls: string[] = []
    const fakeClassList = {
      add: (...tokens: string[]) => calls.push(`add:${tokens.join(",")}`),
      remove: (...tokens: string[]) => calls.push(`remove:${tokens.join(",")}`),
      replace: (oldToken: string, newToken: string) =>
        calls.push(`replace:${oldToken}->${newToken}`),
      toggle: (token: string) => calls.push(`toggle:${token}`),
    }
    data.fn({ classList: fakeClassList })
    expect(calls).toEqual([
      "remove:closed",
      "replace:state-a->state-b",
      "toggle:pinned",
      "add:open",
    ])
  })

  test("classListSet sets className via assignment", () => {
    const builder = dom.body("body")
    const effects = builder.classListSet(["one", "two"])

    expect(effects[1]?.label).toBe("domMutate")
    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
      targetResourceId: string
    }
    expect(data.label).toBe("classListSet(one two)")

    const node = { classList: {}, className: "" }
    data.fn(node)
    expect(node.className).toBe("one two")
  })

  test("callMethod invokes the element method with provided args", () => {
    const builder = dom.body("body")
    const effects = builder.callMethod("scrollTo", 10, 20)

    expect(effects[1]?.label).toBe("domMutate")
    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
      targetResourceId: string
    }
    expect(data.label).toBe("callMethod(scrollTo)")

    const calls: unknown[][] = []
    const node = {
      scrollTo: function (...args: unknown[]) {
        calls.push(args)
      },
    }
    data.fn(node)
    expect(calls).toEqual([[10, 20]])
  })

  test("applyMethod invokes the element method with args array", () => {
    const builder = dom.body("body")
    const effects = builder.applyMethod("scrollTo", [30, 40])

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }
    expect(data.label).toBe("applyMethod(scrollTo)")

    const calls: unknown[][] = []
    const node = {
      scrollTo: function (...args: unknown[]) {
        calls.push(args)
      },
    }
    data.fn(node)
    expect(calls).toEqual([[30, 40]])
  })

  test("setValue writes value on value-like targets", () => {
    const effects = dom.input("#email", "email-input").setValue("a@b.com")

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
      targetResourceId: string
    }

    expect(data.label).toBe("setValue")
    expect(data.targetResourceId).toBe("email-input")

    const input = { value: "" }
    data.fn(input)
    expect(input.value).toBe("a@b.com")
  })

  test("setChecked writes checked on checked-like targets", () => {
    const effects = dom.input("#accept", "accept-input").setChecked(true)

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("setChecked(true)")

    const input = { checked: false }
    data.fn(input)
    expect(input.checked).toBe(true)
  })

  test("setText writes textContent", () => {
    const effects = dom.querySelector(".status", "status").setText("Saved")

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("setText")

    const node = { textContent: "" }
    data.fn(node)
    expect(node.textContent).toBe("Saved")
  })

  test("setInnerHTML writes innerHTML", () => {
    const effects = dom
      .querySelector(".status", "status")
      .setInnerHTML("<strong>Saved</strong>")

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("setInnerHTML")

    const node = { innerHTML: "" }
    data.fn(node)
    expect(node.innerHTML).toBe("<strong>Saved</strong>")
  })

  test("replaceChildren calls replaceChildren when available", () => {
    const textNode = { nodeType: 3 } as unknown as Node
    const spanNode = { nodeType: 1 } as unknown as Node
    const effects = dom
      .querySelector(".status", "status")
      .replaceChildren(textNode, spanNode)

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("replaceChildren")

    const calls: unknown[][] = []
    const node = {
      replaceChildren(...args: unknown[]) {
        calls.push(args)
      },
    }

    data.fn(node)
    expect(calls).toEqual([[textNode, spanNode]])
  })

  test("ownerDocument can chain mutate helpers", () => {
    const element = { id: "node-1" } as unknown as Element
    const child = { nodeType: 1 } as unknown as Node
    const effects = dom
      .fromElement(element, "node")
      .ownerDocument()
      .replaceChildren(child)

    const chainData = effects[0]?.data as
      | {
          acquire: {
            data: {
              kind: string
              method: string
              resourceId: string
              scopeResourceId: string
            }
          }
        }
      | undefined
    const acquire = chainData?.acquire.data
    const mutate = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
      targetResourceId: string
    }

    expect(acquire?.kind).toBe("query")
    expect(acquire?.method).toBe("ownerDocument")
    expect(acquire?.scopeResourceId).toBe("node")
    expect(mutate.label).toBe("replaceChildren")
    expect(mutate.targetResourceId).toBe(acquire?.resourceId)

    const calls: unknown[][] = []
    mutate.fn({
      replaceChildren(...args: unknown[]) {
        calls.push(args)
      },
    })
    expect(calls).toEqual([[child]])
  })

  test("appendChildren calls append when available", () => {
    const firstNode = { nodeType: 3 } as unknown as Node
    const secondNode = { nodeType: 1 } as unknown as Node
    const effects = dom
      .querySelector(".status", "status")
      .appendChildren(firstNode, secondNode)

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("appendChildren")

    const calls: unknown[][] = []
    const node = {
      append(...args: unknown[]) {
        calls.push(args)
      },
    }

    data.fn(node)
    expect(calls).toEqual([[firstNode, secondNode]])
  })

  test("prependChildren calls prepend when available", () => {
    const firstNode = { nodeType: 3 } as unknown as Node
    const secondNode = { nodeType: 1 } as unknown as Node
    const effects = dom
      .querySelector(".status", "status")
      .prependChildren(firstNode, secondNode)

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("prependChildren")

    const calls: unknown[][] = []
    const node = {
      prepend(...args: unknown[]) {
        calls.push(args)
      },
    }

    data.fn(node)
    expect(calls).toEqual([[firstNode, secondNode]])
  })

  test("clearChildren clears via replaceChildren with no args", () => {
    const effects = dom.querySelector(".status", "status").clearChildren()

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("clearChildren")

    const calls: unknown[][] = []
    const node = {
      replaceChildren(...args: unknown[]) {
        calls.push(args)
      },
    }

    data.fn(node)
    expect(calls).toEqual([[]])
  })

  test("setProperty writes arbitrary properties", () => {
    const effects = dom
      .input("#search", "search-input")
      .setProperty("autocomplete", "off")

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("setProperty(autocomplete)")

    const node = { autocomplete: "on" }
    data.fn(node)
    expect(node.autocomplete).toBe("off")
  })

  test("setAttribute calls setAttribute when available", () => {
    const effects = dom
      .input("#search", "search-input")
      .setAttribute("autocomplete", "off")

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("setAttribute(autocomplete)")

    const calls: Array<{ name: string; value: string }> = []
    const node = {
      setAttribute(name: string, value: string) {
        calls.push({ name, value })
      },
    }

    data.fn(node)
    expect(calls).toEqual([
      {
        name: "autocomplete",
        value: "off",
      },
    ])
  })

  test("setSelectionRange supports optional direction", () => {
    const withoutDirection = dom
      .input("#search", "search-input")
      .setSelectionRange(1, 3)
    const withDirection = dom
      .input("#search", "search-input")
      .setSelectionRange(2, 4, "forward")

    const firstData = withoutDirection[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }
    const secondData = withDirection[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(firstData.label).toBe("setSelectionRange(1,3)")
    expect(secondData.label).toBe("setSelectionRange(2,4,forward)")

    const calls: unknown[][] = []
    const node = {
      setSelectionRange(...args: unknown[]) {
        calls.push(args)
      },
    }

    firstData.fn(node)
    secondData.fn(node)

    expect(calls).toEqual([
      [1, 3],
      [2, 4, "forward"],
    ])
  })

  test("dispatchEvent emits Event and CustomEvent with defaults", () => {
    const baseEffects = dom
      .input("#search", "search-input")
      .dispatchEvent("input")
    const customEffects = dom
      .input("#search", "search-input")
      .dispatchEvent("fizz:select", {
        detail: {
          value: "match",
        },
      })

    const baseData = baseEffects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }
    const customData = customEffects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(baseData.label).toBe("dispatchEvent(input)")
    expect(customData.label).toBe("dispatchEvent(fizz:select)")

    const events: Event[] = []
    const node = {
      dispatchEvent(event: Event) {
        events.push(event)
        return true
      },
    }

    baseData.fn(node)
    customData.fn(node)

    expect(events[0]?.type).toBe("input")
    expect(events[0]?.bubbles).toBe(true)
    expect(events[0]?.cancelable).toBe(true)
    expect(events[1]).toBeInstanceOf(CustomEvent)
    expect((events[1] as CustomEvent<{ value: string }>).detail).toEqual({
      value: "match",
    })
  })

  test("dispatchEvent accepts a prebuilt Event instance", () => {
    const readyEvent = new Event("ready", {
      bubbles: false,
      cancelable: false,
    })
    const effects = dom
      .querySelector(".status", "status")
      .dispatchEvent(readyEvent)

    const data = effects[1]?.data as {
      fn: (target: unknown) => void
      label: string
    }

    expect(data.label).toBe("dispatchEvent(ready)")

    const events: Event[] = []
    const node = {
      dispatchEvent(event: Event) {
        events.push(event)
        return true
      },
    }

    data.fn(node)

    expect(events).toEqual([readyEvent])
  })

  test("callMethod silently ignores missing methods on the target", () => {
    const builder = dom.fromElement<Record<string, unknown>>({}, "body")
    const effects = builder.callMethod("missingMethod")
    const fn = (effects[1]?.data as { fn: (t: unknown) => void }).fn

    expect(() => fn({})).not.toThrow()
    expect(() => fn(null)).not.toThrow()
  })

  test("observeIntersection supports overloads with and without observer id", () => {
    const visible = action("Visible")
    const builder = dom.body("body")

    const withOptions = builder.observeIntersection(() => visible(), {
      threshold: 0.5,
    })

    expect(withOptions[0]?.label).toBe("domChain")
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

    expect(withOptions[0]?.label).toBe("domChain")
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
    expect(dom.activeElement().data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "activeElement",
      target: "activeElement",
    })

    expect(dom.documentElement().data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "documentElement",
      target: "documentElement",
    })

    expect(dom.visualViewport().data.acquire.data).toEqual({
      kind: "singleton",
      resourceId: "visualViewport",
      target: "visualViewport",
    })

    expect(
      dom.getElementsByClassName("card", "items").data.acquire.data,
    ).toEqual({
      args: ["card"],
      kind: "query",
      method: "getElementsByClassName",
      resourceId: "items",
    })

    expect(dom.getElementsByName("q", "named").data.acquire.data).toEqual({
      args: ["q"],
      kind: "query",
      method: "getElementsByName",
      resourceId: "named",
    })

    expect(dom.getElementsByTagName("li", "rows").data.acquire.data).toEqual({
      args: ["li"],
      kind: "query",
      method: "getElementsByTagName",
      resourceId: "rows",
    })

    expect(
      dom.querySelectorAll(".item", "all-items").data.acquire.data,
    ).toEqual({
      args: [".item"],
      kind: "query",
      method: "querySelectorAll",
      resourceId: "all-items",
    })

    expect(dom.input("#email", "email-input").data.acquire.data).toEqual({
      args: ["#email"],
      kind: "query",
      method: "querySelector",
      resourceId: "email-input",
    })

    expect(dom.textarea("#notes", "notes-input").data.acquire.data).toEqual({
      args: ["#notes"],
      kind: "query",
      method: "querySelector",
      resourceId: "notes-input",
    })

    expect(dom.select("#country", "country-input").data.acquire.data).toEqual({
      args: ["#country"],
      kind: "query",
      method: "querySelector",
      resourceId: "country-input",
    })

    const scoped = dom.from("container")

    expect(
      scoped.getElementsByClassName("card", "cards").data.acquire.data,
    ).toEqual({
      args: ["card"],
      kind: "query",
      method: "getElementsByClassName",
      resourceId: "cards",
      scopeResourceId: "container",
    })

    expect(
      scoped.getElementsByName("email", "inputs").data.acquire.data,
    ).toEqual({
      args: ["email"],
      kind: "query",
      method: "getElementsByName",
      resourceId: "inputs",
      scopeResourceId: "container",
    })

    expect(
      scoped.querySelectorAll(".match", "found").data.acquire.data,
    ).toEqual({
      args: [".match"],
      kind: "query",
      method: "querySelectorAll",
      resourceId: "found",
      scopeResourceId: "container",
    })

    expect(scoped.input("#email", "scoped-input").data.acquire.data).toEqual({
      args: ["#email"],
      kind: "query",
      method: "querySelector",
      resourceId: "scoped-input",
      scopeResourceId: "container",
    })

    expect(
      scoped.textarea("#notes", "scoped-textarea").data.acquire.data,
    ).toEqual({
      args: ["#notes"],
      kind: "query",
      method: "querySelector",
      resourceId: "scoped-textarea",
      scopeResourceId: "container",
    })

    expect(
      scoped.select("#country", "scoped-select").data.acquire.data,
    ).toEqual({
      args: ["#country"],
      kind: "query",
      method: "querySelector",
      resourceId: "scoped-select",
      scopeResourceId: "container",
    })
  })

  test("auto-generates resource ids when omitted from dom queries", () => {
    const element = nodeLike()

    const queryEffect = dom.querySelector(".item").data.acquire.data as {
      resourceId: string
    }
    expect(typeof queryEffect.resourceId).toBe("string")
    expect(queryEffect.resourceId.length).toBeGreaterThan(0)

    const fromElementEffect = dom.fromElement(element).data.acquire.data as {
      resourceId: string
    }
    expect(typeof fromElementEffect.resourceId).toBe("string")
    expect(fromElementEffect.resourceId.length).toBeGreaterThan(0)

    const scopedEffect = dom.from("scope").getElementById("submit").data.acquire
      .data as {
      resourceId: string
    }
    expect(typeof scopedEffect.resourceId).toBe("string")
    expect(scopedEffect.resourceId.length).toBeGreaterThan(0)

    const first = dom.querySelector(".item").data.acquire.data as {
      resourceId: string
    }
    const second = dom.querySelector(".item").data.acquire.data as {
      resourceId: string
    }
    expect(first.resourceId).not.toBe(second.resourceId)
  })
})
