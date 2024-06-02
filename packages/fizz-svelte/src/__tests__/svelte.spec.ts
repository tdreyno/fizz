/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom"

import Comp from "./Comp.svelte"
import { act, render } from "@testing-library/svelte"

function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}

describe("Svelte integration", () => {
  test("inital render", async () => {
    const { getByTestId } = render(Comp)

    expect(getByTestId("name")).toHaveTextContent("Initializing")
    expect(getByTestId("didWorld")).toHaveTextContent("false")

    await act(async () => {
      await timeout(5000)
    })

    expect(getByTestId("name")).toHaveTextContent("Ready")
    expect(getByTestId("didWorld")).toHaveTextContent("true")
  }, 6000)
})
