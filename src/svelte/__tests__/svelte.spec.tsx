/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import "@testing-library/jest-dom/extend-expect"

import Comp from "./Comp.svelte"
import { render } from "@testing-library/svelte"

describe("Svelte integration", () => {
  test("inital render", async () => {
    const { getByTestId } = render(Comp)
    expect(getByTestId("name")).toHaveTextContent("Initializing")
  })
})
