/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals"
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { createElement } from "react"

import { createMachineContext } from "../createMachineContext"
import { Machine, States } from "./machine"

describe("createMachineContext", () => {
  test("shares a runtime across child consumers", async () => {
    const { Provider, useMachineContext } = createMachineContext(Machine)

    const DispatchWorld = () => {
      const machine = useMachineContext()

      return createElement(
        "button",
        {
          onClick: async () => {
            await machine.actions.world().asPromise()
          },
        },
        "World",
      )
    }

    const MachineState = ({ testId }: { testId: string }) => {
      const machine = useMachineContext()

      return createElement(
        "div",
        { "data-testid": testId },
        machine.currentState.name,
      )
    }

    const WorldStatus = () => {
      const machine = useMachineContext()
      const data = machine.currentState.data as { didWorld: boolean }

      return createElement(
        "div",
        { "data-testid": "world-status" },
        data.didWorld ? "world" : "waiting",
      )
    }

    const IsInitializing = () => {
      const machine = useMachineContext()

      return createElement(
        "div",
        { "data-testid": "is-initializing" },
        machine.currentState.is(machine.states.Initializing)
          ? "initializing"
          : "not-initializing",
      )
    }

    const IsReady = () => {
      const machine = useMachineContext()

      return createElement(
        "div",
        { "data-testid": "is-ready" },
        machine.currentState.is(machine.states.Ready) ? "ready" : "not-ready",
      )
    }

    const IsReadySelector = () => {
      const machine = useMachineContext()

      return createElement(
        "div",
        { "data-testid": "is-ready-selector" },
        machine.selectors.isReady ? "ready" : "not-ready",
      )
    }

    render(
      createElement(
        Provider,
        {
          initialState: States.Initializing({ didWorld: false }),
        },
        createElement(DispatchWorld),
        createElement(MachineState, { testId: "machine-a" }),
        createElement(MachineState, { testId: "machine-b" }),
        createElement(WorldStatus),
        createElement(IsInitializing),
        createElement(IsReady),
        createElement(IsReadySelector),
      ),
    )

    expect(screen.getByTestId("machine-a").textContent).toBe("Initializing")
    expect(screen.getByTestId("machine-b").textContent).toBe("Initializing")
    expect(screen.getByTestId("world-status").textContent).toBe("waiting")
    expect(screen.getByTestId("is-initializing").textContent).toBe(
      "initializing",
    )
    expect(screen.getByTestId("is-ready").textContent).toBe("not-ready")
    expect(screen.getByTestId("is-ready-selector").textContent).toBe(
      "not-ready",
    )

    fireEvent.click(screen.getByText("World"))

    await waitFor(() => {
      expect(screen.getByTestId("machine-a").textContent).toBe("Ready")
    })

    expect(screen.getByTestId("machine-b").textContent).toBe("Ready")
    expect(screen.getByTestId("world-status").textContent).toBe("world")
    expect(screen.getByTestId("is-initializing").textContent).toBe(
      "not-initializing",
    )
    expect(screen.getByTestId("is-ready").textContent).toBe("ready")
    expect(screen.getByTestId("is-ready-selector").textContent).toBe("ready")
  })

  test("throws when consumed outside the matching provider", () => {
    const { useMachineContext } = createMachineContext(Machine)

    expect(() => renderHook(() => useMachineContext())).toThrow(
      "useMachineContext must be used within the matching machine Provider",
    )
  })
})
