/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import "@testing-library/jest-dom/extend-expect"

import Comp from "./Comp.svelte"
import { act, render } from "@testing-library/svelte"
import { timeout } from "../../__tests__/util"

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
