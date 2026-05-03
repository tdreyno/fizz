/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test } from "@jest/globals"

import { browserDriver } from "../index"

describe("browserDriver", () => {
  test("query helpers support document and scoped element lookups", () => {
    const container = document.createElement("div")
    container.innerHTML =
      '<span id="item" class="row" name="n1"></span><span class="row"></span>'
    document.body.appendChild(container)

    expect(browserDriver.getElementById("item", document)?.id).toBe("item")
    expect(browserDriver.getElementById("item", container)?.id).toBe("item")
    expect(browserDriver.getElementsByClassName("row", container)).toHaveLength(
      2,
    )
    expect(browserDriver.getElementsByTagName("span", container)).toHaveLength(
      2,
    )
    expect(browserDriver.getElementsByName("n1", document)).toHaveLength(1)

    document.body.removeChild(container)
  })

  test("history and location adapters expose snapshot access", () => {
    expect(browserDriver.history()).not.toBeNull()
    expect(browserDriver.location()).not.toBeNull()
    expect(browserDriver.window()).toBe(window)
    expect(browserDriver.document()).toBe(document)
    expect(browserDriver.body()).toBe(document.body)
    expect(browserDriver.documentElement()).toBe(document.documentElement)
  })

  test("falls back to query APIs when scope is not a document", () => {
    const scope = {
      getElementsByClassName: (className: string) => [className],
      getElementsByTagName: (tagName: string) => [tagName],
      querySelector: (selector: string) => ({ selector }),
      querySelectorAll: (selector: string) => [{ selector }],
    } as unknown as Element

    expect(browserDriver.getElementById("x", scope)).toEqual({
      selector: "#x",
    })
    expect(browserDriver.getElementsByClassName("c", scope)).toEqual(["c"])
    expect(browserDriver.getElementsByName("n", scope)).toEqual([
      { selector: '[name="n"]' },
    ])
    expect(browserDriver.getElementsByTagName("span", scope)).toEqual(["span"])
    expect(browserDriver.querySelector(".x", scope)).toEqual({
      selector: ".x",
    })
    expect(browserDriver.querySelectorAll(".x", scope)).toEqual([
      { selector: ".x" },
    ])
  })

  test("supports observer and clipboard success paths", async () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver
    const originalResizeObserver = globalThis.ResizeObserver
    const originalNavigator = globalThis.navigator
    const observe = jest.fn()
    const disconnect = jest.fn()

    class FakeIntersectionObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        void callback
        void options
      }

      disconnect = disconnect
      observe = observe
      takeRecords = () => []
      root = null
      rootMargin = "0px"
      thresholds = [0]
      unobserve = jest.fn()
    }

    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        void callback
      }

      disconnect = disconnect
      observe = observe
      unobserve = jest.fn()
    }

    const writeText = jest.fn(async () => undefined)

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: FakeIntersectionObserver,
    })
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: FakeResizeObserver,
    })
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    const intersectionObserver = browserDriver.createIntersectionObserver(
      () => undefined,
    )
    const resizeObserver = browserDriver.createResizeObserver(() => undefined)

    expect(intersectionObserver).toBeInstanceOf(FakeIntersectionObserver)
    expect(resizeObserver).toBeInstanceOf(FakeResizeObserver)

    await expect(
      browserDriver.copyToClipboard("hello"),
    ).resolves.toBeUndefined()
    expect(writeText).toHaveBeenCalledWith("hello")

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: originalResizeObserver,
    })
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    })
  })

  test("one-way methods delegate to global browser APIs", () => {
    const alertSpy = jest
      .spyOn(globalThis, "alert")
      .mockImplementation(() => undefined)
    const confirmSpy = jest
      .spyOn(globalThis, "confirm")
      .mockImplementation(() => true)
    const openSpy = jest
      .spyOn(globalThis, "open")
      .mockImplementation(() => null)
    const printSpy = jest
      .spyOn(globalThis, "print")
      .mockImplementation(() => undefined)
    const postSpy = jest
      .spyOn(globalThis, "postMessage")
      .mockImplementation(() => undefined)

    void browserDriver.alert("heads up")
    expect(browserDriver.confirm("proceed?")).toBe(true)
    void browserDriver.openUrl("https://example.com", "_blank", "noopener")
    void browserDriver.printPage()
    void browserDriver.postMessage({ type: "ping" }, "*")

    expect(alertSpy).toHaveBeenCalledWith("heads up")
    expect(confirmSpy).toHaveBeenCalledWith("proceed?")
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener",
    )
    expect(printSpy).toHaveBeenCalled()
    expect(postSpy).toHaveBeenCalledWith({ type: "ping" }, "*", undefined)

    alertSpy.mockRestore()
    confirmSpy.mockRestore()
    openSpy.mockRestore()
    printSpy.mockRestore()
    postSpy.mockRestore()
  })

  test("throws when clipboard API is unavailable", () => {
    const originalNavigator = globalThis.navigator

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    })

    expect(() => browserDriver.copyToClipboard("hello")).toThrow(
      "navigator.clipboard.writeText",
    )

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    })
  })

  test("throws when IntersectionObserver and ResizeObserver are missing", () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver
    const originalResizeObserver = globalThis.ResizeObserver

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: undefined,
    })

    expect(() =>
      browserDriver.createIntersectionObserver(() => undefined),
    ).toThrow("IntersectionObserver")
    expect(() => browserDriver.createResizeObserver(() => undefined)).toThrow(
      "ResizeObserver",
    )

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: originalIntersectionObserver,
    })
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: originalResizeObserver,
    })
  })

  test("throws when required browser globals are missing", () => {
    const originalAlert = globalThis.alert

    Object.defineProperty(globalThis, "alert", {
      configurable: true,
      value: undefined,
    })

    expect(() => browserDriver.alert("hey")).toThrow("globalThis.alert")

    Object.defineProperty(globalThis, "alert", {
      configurable: true,
      value: originalAlert,
    })
  })
})
