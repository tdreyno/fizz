import { jest } from "@jest/globals"

import { timeout } from "../../__tests__/util"
import type { Action, ActionCreatorType, Enter } from "../../action"
import { action, enter } from "../../action"
import { createInitialContext } from "../../context"
import {
  alert,
  confirm,
  copyToClipboard,
  historyBack,
  historyForward,
  historyGo,
  historyPushState,
  historyReplaceState,
  historySetScrollRestoration,
  locationAssign,
  locationReload,
  locationReplace,
  locationSetHash,
  locationSetHost,
  locationSetHostname,
  locationSetHref,
  locationSetPathname,
  locationSetPort,
  locationSetProtocol,
  locationSetSearch,
  noop,
  openUrl,
  postMessage,
  printPage,
  prompt,
} from "../../effect"
import { Runtime } from "../../runtime"
import { state } from "../../state"

const settle = async () => {
  await timeout(0)
  await timeout(0)
}

describe("Browser effects", () => {
  test("should dispatch ConfirmAccepted when browser confirm accepts", async () => {
    type Data = {
      accepted: boolean
      rejected: boolean
    }

    const Confirming = state<Enter, Data>(
      {
        Enter: () => confirm("Proceed?"),
        ConfirmAccepted: (data, _, { update }) =>
          update({
            ...data,
            accepted: true,
          }),
        ConfirmRejected: (data, _, { update }) =>
          update({
            ...data,
            rejected: true,
          }),
      },
      { name: "Confirming" },
    )

    const runtime = new Runtime(
      createInitialContext([
        Confirming({
          accepted: false,
          rejected: false,
        }),
      ]),
      {},
      {},
      {
        browserDriver: {
          confirm: () => "accept",
        },
      },
    )

    const accepted = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Confirming) && currentState.data.accepted) {
          unsubscribe()
          resolve()
        }
      })
    })

    await runtime.run(enter())
    await accepted

    const currentState = runtime.currentState()

    if (!currentState.is(Confirming)) {
      throw new Error("Expected Confirming state")
    }

    expect(currentState.data).toEqual({
      accepted: true,
      rejected: false,
    })
  })

  test("should dispatch PromptSubmitted when browser prompt returns a value", async () => {
    type Data = {
      cancelled: boolean
      value?: string
    }

    const Prompting = state<Enter, Data>(
      {
        Enter: () => prompt("Name"),
        PromptCancelled: (data, _, { update }) =>
          update({
            ...data,
            cancelled: true,
          }),
        PromptSubmitted: (data, value, { update }) =>
          update({
            ...data,
            value,
          }),
      },
      { name: "Prompting" },
    )

    const runtime = new Runtime(
      createInitialContext([
        Prompting({
          cancelled: false,
        }),
      ]),
      {},
      {},
      {
        browserDriver: {
          prompt: () => "Ada",
        },
      },
    )

    const submitted = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Prompting) && currentState.data.value === "Ada") {
          unsubscribe()
          resolve()
        }
      })
    })

    await runtime.run(enter())
    await submitted

    const currentState = runtime.currentState()

    if (!currentState.is(Prompting)) {
      throw new Error("Expected Prompting state")
    }

    expect(currentState.data).toEqual({
      cancelled: false,
      value: "Ada",
    })
  })

  test("should keep pending confirm active across a normal state transition", async () => {
    const cancel = action("Cancel")
    type Cancel = ActionCreatorType<typeof cancel>

    type Data = {
      acceptedAfterTransition: boolean
    }

    let resolveConfirm: ((value: "accept" | "reject") => void) | undefined

    const confirmResult = new Promise<"accept" | "reject">(resolve => {
      resolveConfirm = resolve
    })

    const Cancelled = state<Action<string, unknown>, Data>(
      {
        ConfirmAccepted: (data, _, { update }) =>
          update({
            ...data,
            acceptedAfterTransition: true,
          }),
        ConfirmRejected: noop,
      },
      { name: "Cancelled" },
    )

    const Confirming = state<Enter | Cancel, Data>(
      {
        Cancel: data => Cancelled(data),
        Enter: () => confirm("Proceed?"),
        ConfirmAccepted: noop,
        ConfirmRejected: noop,
      },
      { name: "Confirming" },
    )

    const runtime = new Runtime(
      createInitialContext([
        Confirming({
          acceptedAfterTransition: false,
        }),
      ]),
      { cancel },
      {},
      {
        browserDriver: {
          confirm: () => confirmResult,
        },
      },
    )

    await runtime.run(enter())
    await runtime.run(cancel())

    const acceptedAfterTransition = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (
          currentState.is(Cancelled) &&
          currentState.data.acceptedAfterTransition
        ) {
          unsubscribe()
          resolve()
        }
      })
    })

    resolveConfirm?.("accept")
    await acceptedAfterTransition

    const currentState = runtime.currentState()

    if (!currentState.is(Cancelled)) {
      throw new Error("Expected Cancelled state")
    }

    expect(currentState.data.acceptedAfterTransition).toBe(true)
  })

  test("should run copyToClipboard as a fire-and-forget browser effect", async () => {
    const copy = jest.fn(() => Promise.resolve())

    const Copying = state<Enter>(
      {
        Enter: () => copyToClipboard("hello"),
      },
      { name: "Copying" },
    )

    const runtime = new Runtime(
      createInitialContext([Copying()]),
      {},
      {},
      {
        browserDriver: {
          copyToClipboard: copy,
        },
      },
    )

    await runtime.run(enter())
    await settle()

    expect(copy).toHaveBeenCalledWith("hello")
  })

  test("should execute one-way browser driver effects", async () => {
    const alertMethod = jest.fn()
    const copy = jest.fn()
    const open = jest.fn()
    const print = jest.fn()
    const locationAssignMethod = jest.fn()
    const locationReplaceMethod = jest.fn()
    const locationReloadMethod = jest.fn()
    const historyBackMethod = jest.fn()
    const historyForwardMethod = jest.fn()
    const historyGoMethod = jest.fn()
    const historyPushStateMethod = jest.fn()
    const historyReplaceStateMethod = jest.fn()
    const historySetScrollRestorationMethod = jest.fn()
    const locationSetHashMethod = jest.fn()
    const locationSetHostMethod = jest.fn()
    const locationSetHostnameMethod = jest.fn()
    const locationSetHrefMethod = jest.fn()
    const locationSetPathnameMethod = jest.fn()
    const locationSetPortMethod = jest.fn()
    const locationSetProtocolMethod = jest.fn()
    const locationSetSearchMethod = jest.fn()
    const postMessageMethod = jest.fn()

    const Effects = state<Enter>(
      {
        Enter: () => [
          alert("Heads up"),
          copyToClipboard("hello"),
          openUrl("https://example.com", "_blank", "noopener"),
          printPage(),
          locationAssign("/next"),
          locationReplace("/replace"),
          locationReload(),
          historyBack(),
          historyForward(),
          historyGo(-1),
          historyPushState({ page: "a" }, "/a"),
          historyReplaceState({ page: "b" }, "/b"),
          historySetScrollRestoration("manual"),
          locationSetHash("section"),
          locationSetHost("example.com"),
          locationSetHostname("example.com"),
          locationSetHref("https://example.com/page"),
          locationSetPathname("/p"),
          locationSetPort("8080"),
          locationSetProtocol("https:"),
          locationSetSearch("?q=1"),
          postMessage({ type: "ping" }, "https://example.com"),
        ],
      },
      { name: "Effects" },
    )

    const runtime = new Runtime(
      createInitialContext([Effects()]),
      {},
      {},
      {
        browserDriver: {
          alert: alertMethod,
          copyToClipboard: copy,
          historyBack: historyBackMethod,
          historyForward: historyForwardMethod,
          historyGo: historyGoMethod,
          historyPushState: historyPushStateMethod,
          historyReplaceState: historyReplaceStateMethod,
          historySetScrollRestoration: historySetScrollRestorationMethod,
          locationAssign: locationAssignMethod,
          locationReload: locationReloadMethod,
          locationReplace: locationReplaceMethod,
          locationSetHash: locationSetHashMethod,
          locationSetHost: locationSetHostMethod,
          locationSetHostname: locationSetHostnameMethod,
          locationSetHref: locationSetHrefMethod,
          locationSetPathname: locationSetPathnameMethod,
          locationSetPort: locationSetPortMethod,
          locationSetProtocol: locationSetProtocolMethod,
          locationSetSearch: locationSetSearchMethod,
          openUrl: open,
          postMessage: postMessageMethod,
          printPage: print,
        },
      },
    )

    await runtime.run(enter())
    await settle()

    expect(alertMethod).toHaveBeenCalledWith("Heads up")
    expect(copy).toHaveBeenCalledWith("hello")
    expect(open).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener",
    )
    expect(print).toHaveBeenCalled()
    expect(locationAssignMethod).toHaveBeenCalledWith("/next")
    expect(locationReplaceMethod).toHaveBeenCalledWith("/replace")
    expect(locationReloadMethod).toHaveBeenCalled()
    expect(historyBackMethod).toHaveBeenCalled()
    expect(historyForwardMethod).toHaveBeenCalled()
    expect(historyGoMethod).toHaveBeenCalledWith(-1)
    expect(historyPushStateMethod).toHaveBeenCalledWith({ page: "a" }, "/a")
    expect(historyReplaceStateMethod).toHaveBeenCalledWith({ page: "b" }, "/b")
    expect(historySetScrollRestorationMethod).toHaveBeenCalledWith("manual")
    expect(locationSetHashMethod).toHaveBeenCalledWith("section")
    expect(locationSetHostMethod).toHaveBeenCalledWith("example.com")
    expect(locationSetHostnameMethod).toHaveBeenCalledWith("example.com")
    expect(locationSetHrefMethod).toHaveBeenCalledWith(
      "https://example.com/page",
    )
    expect(locationSetPathnameMethod).toHaveBeenCalledWith("/p")
    expect(locationSetPortMethod).toHaveBeenCalledWith("8080")
    expect(locationSetProtocolMethod).toHaveBeenCalledWith("https:")
    expect(locationSetSearchMethod).toHaveBeenCalledWith("?q=1")
    expect(postMessageMethod).toHaveBeenCalledWith(
      { type: "ping" },
      "https://example.com",
      undefined,
    )
  })

  test("should throw when a required browser driver method is missing", async () => {
    const Effects = state<Enter>(
      {
        Enter: () => alert("Heads up"),
      },
      { name: "Effects" },
    )

    const runtime = new Runtime(
      createInitialContext([Effects()]),
      {},
      {},
      {
        browserDriver: {},
      },
    )

    await expect(runtime.run(enter())).rejects.toThrow(
      "Fizz browser driver is missing `alert` but the corresponding effect was used.",
    )
  })
})
