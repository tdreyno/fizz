import { jest } from "@jest/globals"

import type { Action, ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { confirm, copyToClipboard, noop, prompt } from "../effect"
import { Runtime } from "../runtime"
import { state } from "../state"
import { timeout } from "./util"

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
})
