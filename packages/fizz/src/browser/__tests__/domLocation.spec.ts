import { describe, expect, jest, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../../action"
import { action, enter } from "../../action"
import { createInitialContext } from "../../context"
import {
  locationSetHash,
  locationSetHost,
  locationSetHostname,
  locationSetHref,
  locationSetPathname,
  locationSetPort,
  locationSetProtocol,
  locationSetSearch,
  noop,
} from "../../effect"
import { Runtime } from "../../runtime"
import { state } from "../../state"
import { dom } from "../domEffects"
import { createMockDomDriver } from "./domTestUtils"

const timeout = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

describe("DOM location", () => {
  test("should dispatch mapped actions from location.listen('hashchange') and clean up on state exit", async () => {
    const didHashChange = action("DidHashChange").withPayload<HashChangeEvent>()
    const finish = action("Finish")

    type DidHashChange = ActionCreatorType<typeof didHashChange>
    type Finish = ActionCreatorType<typeof finish>

    const Done = state<Enter, { count: number }>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Listening = state<Enter | DidHashChange | Finish, { count: number }>(
      {
        DidHashChange: (data, _, { update }) =>
          update({ count: data.count + 1 }),
        Enter: () => dom.location().listen("hashchange", didHashChange),
        Finish: data => Done(data),
      },
      { name: "Listening" },
    )

    const mock = createMockDomDriver()
    const runtime = new Runtime(
      createInitialContext([Listening({ count: 0 })]),
      { didHashChange, finish },
      {},
      { browserDriver: mock.driver },
    )

    await runtime.run(enter())

    expect(mock.emit.location.listenerCount("hashchange")).toBe(1)

    const changed = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Listening) && currentState.data.count === 1) {
          unsubscribe()
          resolve()
        }
      })
    })

    mock.emit.location.emit("hashchange", new Event("hashchange"))
    await changed

    const current = runtime.currentState()

    expect(current.name).toBe("Listening")
    expect((current.data as { count: number }).count).toBe(1)

    await runtime.run(finish())

    expect(mock.emit.location.listenerCount("hashchange")).toBe(0)
  })

  test("should call driver locationSetHash with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetHash("#section") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetHash: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("#section")
  })

  test("should call driver locationSetHref with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetHref("http://example.com/") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetHref: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("http://example.com/")
  })

  test("should call driver locationSetHost with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetHost("example.com:8080") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetHost: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("example.com:8080")
  })

  test("should call driver locationSetHostname with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetHostname("example.com") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetHostname: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("example.com")
  })

  test("should call driver locationSetPathname with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetPathname("/new/path") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetPathname: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("/new/path")
  })

  test("should call driver locationSetPort with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetPort("9000") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetPort: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("9000")
  })

  test("should call driver locationSetProtocol with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetProtocol("https:") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetProtocol: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("https:")
  })

  test("should call driver locationSetSearch with value", async () => {
    const fn = jest.fn<(value: string) => void>()

    const S = state<Enter>(
      { Enter: () => locationSetSearch("?q=fizz") },
      { name: "S" },
    )

    const runtime = new Runtime(
      createInitialContext([S()]),
      {},
      {},
      { browserDriver: { locationSetSearch: fn } },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(fn).toHaveBeenCalledWith("?q=fizz")
  })
})
