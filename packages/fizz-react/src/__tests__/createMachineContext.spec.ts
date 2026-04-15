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
import { Actions, OutputActions, States } from "./machine"

describe("createMachineContext", () => {
  test("shares a runtime across child consumers", async () => {
    const { Provider, useMachineContext } = createMachineContext(
      States,
      Actions,
      OutputActions,
    )

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

      return createElement(
        "div",
        { "data-testid": "world-status" },
        machine.currentState.data.didWorld ? "world" : "waiting",
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
      ),
    )

    expect(screen.getByTestId("machine-a").textContent).toBe("Initializing")
    expect(screen.getByTestId("machine-b").textContent).toBe("Initializing")
    expect(screen.getByTestId("world-status").textContent).toBe("waiting")

    fireEvent.click(screen.getByText("World"))

    await waitFor(() => {
      expect(screen.getByTestId("machine-a").textContent).toBe("Ready")
    })

    expect(screen.getByTestId("machine-b").textContent).toBe("Ready")
    expect(screen.getByTestId("world-status").textContent).toBe("world")
  })

  test("throws when consumed outside the matching provider", () => {
    const { useMachineContext } = createMachineContext(
      States,
      Actions,
      OutputActions,
    )

    expect(() => renderHook(() => useMachineContext())).toThrow(
      "useMachineContext must be used within the matching machine Provider",
    )
  })
})
