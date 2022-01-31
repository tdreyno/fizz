/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import "@testing-library/jest-dom/extend-expect"
import { render } from "@testing-library/svelte"
import Comp from "./Comp.svelte"

describe("Svelte integration", () => {
  beforeEach(() => {
    jest.useFakeTimers("modern")
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test("inital render", async () => {
    const { getByRole } = render(Comp)

    expect(getByRole("name")).toHaveTextContent("Initializing")
  })
})
